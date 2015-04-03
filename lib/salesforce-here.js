/*
salesforce-here.js
salesforce-here is a module that streamlines the RETRIEVAL and STORAGE of Salesforce Metadata.
metadata is stored in AWS-S3 cloud storage.


Copyright (c) Benjamin Krig 2015

*/

//modules
var jsforce = require('jsforce');
var aws = require('aws-sdk');
var async = require('async');
var util = require('util');

/*
CONSTANTS
*/
var salesforce_api_ver = '33.0';

//AWS S3 setup
var AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY;
var AWS_SECRET_KEY = process.env.AWS_SECRET_KEY;
var S3_BUCKET = process.env.S3_BUCKET


//AWS S3 configurations
aws.config.update(
{
	accessKeyId: AWS_ACCESS_KEY, 
	secretAccessKey: AWS_SECRET_KEY
});


/*
RESPONSES contain the following
statuscode:
	100: bad login information
	200: success describing metadata
	300: success retrieving selected metadata
	400: error retrieving selected metadata
	500: error describing metadata
	600: retrieve is finished
	700: retrieve is not finished
	800: unknown
	900: success login check


message:
	contains a simple hardcoded string about the type of response

error:
	contains response error message

(optional)
	(metadata):
		contains metadata from a pull, this will only be seen in salesforce-here.pullmetadata
	(pullid)
		contains string ID of pull request


*/
var ERROR_LOGIN = 
{
  	statuscode: '100',
  	message: 'Bad login, check your user information and organization type.',
  	error: '',
};

var SUCCESS_DESCRIBE_METADATA = 
{
  	statuscode: '200',
  	message: 'Successfully retrieved Metadata descriptions from organization.',
  	metadata: '',
};

var SUCCESS_PULLING_METADATA = 
{
  	statuscode: '300',
  	message: 'Successfully retrieved selected Metadata from organization.',
  	pullid: '',
};

var ERROR_PULLING_METADATA = 
{
  	statuscode: '400',
  	message: 'Error pulling Metadata from organization.',
  	error:'',
};

var ERROR_DESCRIBE_METADATA =
{
	statuscode: '500',
  	message: 'Error getting Metadata descriptions from organization.',
  	error: '',
};

var FINISHED_RETRIEVE =
{
	statuscode: '600',
  	message: 'Finished retrieving Metadata.',
};

var INCOMPLETE_RETRIEVE =
{
	statuscode: '700',
  	message: 'Still retrieving Metadata...',
};

var SUCCESS_LOGIN_CHECK =
{
	statuscode: '900',
  	message: 'Organization successfully saved',
};
//end responses





/*
	uploadZip: uploads the raw binary data package in the form of a buffer to AWS S3 storage.
	this is stored for a maximum of one (1) day

	this function is used for a standard pull push migration and also a scheduled back up.

	called from:
		ppcheckpullstatus() (Pull Push Migration)
		buCheckPullStatus() (Back Up Migration)

	params:
		obj <Object>
			.userid (required) (char array '' containing salesforce.org user email)
			.zipFile (required) (Buffer object containing salesforce package .zip file)
			.timestamp (optional) (Date object)
	
	if Pull Push Migration:
		obj:
			.userid
			.zipFile

	if Scheduled Back Up:
		obj:
	 		.userid 
	 		.zipFile 
	 		.timestamp

	note:
		because this is a private function, checks for obj null pointer exceptions are
		expected to be made BEFORE calling this function.
*/

var uploadZip = function (obj)
{
	var keyName = '';
	
	/*
		determine if obj is for a Scheduled Back Up or Pull Push Migration
	*/
	if(obj.hasOwnProperty('timestamp'))
	{
		//Scheduled Back Up
		keyName = 'scheduled_backup/'+obj.userid+':'+obj.orgid+':'+obj.timestamp; 
	}

	else
	{
		//Pull Push Migration
		keyName = obj.userid;
	}

	var binaryObj = new Buffer(obj.zipFile, 'base64');
	var s3obj = new aws.S3({params: {Bucket: 'here2there', Key: keyName}});
	
	s3obj.upload({Body: binaryObj, ContentType: 'application/zip'})
	.on('httpUploadProgress', function(evt) 
	{ 
		console.log(evt);
	})
	.send(function(err, data) 
	{ 
		console.log(err, data) 
	});
};


/*
	takes a listMetadata() response and returns a folders object that contains an folder name array
	and the type of the folders
*/
var getFolders = function(response, callback)
{
	var folders = 
	{
		names: [],
		type: ''
	};

	//No custom folders found
	if(response == null)
	{
		console.log("No folders found");
		return callback(folders);
	}

	//multiple folders found
	if(util.isArray(response))
	{
		if(response[0].type == 'EmailFolder')
		{
			folders.type = 'EmailTemplate';
		}
		if(response[0].type == 'DashboardFolder')
		{
			folders.type = 'Dashboard';
		}
		if(response[0].type == 'ReportFolder')
		{
			folders.type = 'Report';
		}
		if(response[0].type == 'DocumentFolder')
		{
			folders.type = 'Document';
		}

		async.each(response, function (item, goagain)
		{         	
        	folders.names.push(item.fullName);
        	goagain();
	    }, function(err) 
	    {
	    	if(err)
	    	{
	    		console.log(err);
	    		return callback(folders);
	    	}

	    	return callback(folders);
	    }); 
	}

	//single custom folder found
	else
	{
		folders.names.push(response.fullName);

		if(response.type == 'EmailFolder')
		{
			folders.type = 'EmailTemplate';
		}
		if(response.type == 'DashboardFolder')
		{
			folders.type = 'Dashboard';
		}
		if(response.type == 'ReportFolder')
		{
			folders.type = 'Report';
		}
		if(response.type == 'DocumentFolder')
		{
			folders.type = 'Document';
		}

		return callback(folders);
	}
};

/*
	getFileNames(conn, folders, callback) : 

	uses a JSForce Connection, a getFolder() callback Object<folders> and returns an array of filenames

	JSForce.metadata.list(query<Object>|query<ObjectArray>, callback) has a limit of three (3)
	queries per .list execution. 

	To work with this we use the async.js module's .whilst() to continuously
	util.splice() three (3) query objects into a chunk from the query array and execute a JSForce .list() on
	the spliced chunk and return the filenames from the chunk's queries into the filenames array.

	The .whilst() executes until the statement (query.length > 0) returns false.

*/
var getFileNames = function(conn, folders, callback)
{

	//
	var query = [];

	//
	var filenames = [];


	//for each folder name, push folder type and name into query[]
	async.each(folders.names, function (foldername, eachfoldercallback)
	{ 
		console.log("in each folders");
       	query.push({type: folders.type, folder: foldername});
       	eachfoldercallback();
    }, function(err) 
	{
		//if error, return empty set of filenames
	   	if(err)
	    {
	    	console.log(err);
	    	return callback(filenames);
	    }
	    //else splice query until it is empty
	    else
	    {
	    	async.whilst(
			    function () { return query.length > 0; },
			    function (callback) 
			    {
			        var chunk = query.splice(0,3);
			        conn.metadata.list(chunk, function(err, resp)
					{
						if(err) 
						{
							console.log(err);
							callback();
						}

						if(resp)
						{
							//array
							if(util.isArray(resp))
							{
								async.each(resp, function (item, eachcallback)
								{ 
									console.log(item.fullName);
									filenames.push(item.fullName);
						        	eachcallback();
							    }, function(err) 
							    {
							    	if(err)
							    	{
							    		console.log(err);
							    	}

							    	callback();
							    });
							}

							//object
							else
							{
								console.log(resp.fullName);
								filenames.push(resp.fullName);
								callback();
							}
						}
						else
						{
							callback();
						}
					});
			    },
			    function (err) 
			    {
			    	if(err)
			    	{
			    		console.log(err);
			    	}
				    return callback(filenames);
			    }
			);
	    }
	}); 
};


/*
	login information has already been verified, no need to check or handle error
*/
var getFolderMetadata = function(params, callback)
{
	if(params.orgtype == 0 || params.orgtype == 1)
	{
		var conn = new jsforce.Connection(
		{
			loginUrl: 'https://login.salesforce.com/'
		});
	}
	else
	{
		var conn = new jsforce.Connection(
		{
			loginUrl: 'https://test.salesforce.com/'
		});
	}

	conn.login(params.username, params.password+params.token, function(err, CONNECTION_INFORMATION)
	{
		//login information has already been checked, no need to handle err

		var foldertype = [];

		var fnames = 
		{
			emailnames 	   : [],
			reportnames    : [],
			documentnames  : [],
			dashboardnames : []
		};

		/*
			this block determines whether a type of metadata that requires a Folder lookup
			is in params.xmlnames
		*/
		if(params.xmlnames.indexOf("EmailTemplate") > -1)
		{
			foldertype.push({type: 'EmailFolder'});
		}
		if(params.xmlnames.indexOf("Document") > -1)
		{
			foldertype.push({type: 'DocumentFolder'});
		}
		if(params.xmlnames.indexOf("Dashboard") > -1)
		{
			foldertype.push({type: 'DashboardFolder'});
		}
		if(params.xmlnames.indexOf("Report") > -1)
		{
			foldertype.push({type: 'ReportFolder'});
		}
	
		async.each(foldertype, function(folder, callback) 
		{
			conn.metadata.list(folder, function(err, res)
			{
				//type not found
				if (err) 
				{ 
					console.log(err); 
				}
				getFolders(res, function(foldernames)
				{
					getFileNames(conn, foldernames, function(filenames)
					{
						if(folder.type.indexOf("EmailFolder") > -1)
						{
							fnames.emailnames = filenames;
							callback();
						}
						if(folder.type.indexOf("DocumentFolder") > -1)
						{								
							fnames.documentnames = filenames;
							callback();
						}
						if(folder.type.indexOf("DashboardFolder") > -1)
						{
							fnames.dashboardnames = filenames;
							callback();
						}
						if(folder.type.indexOf("ReportFolder") > -1)
						{
							fnames.reportnames = filenames;
							callback();
						}
					});
				});
			});

		}, function(err)
		{
			console.log('got fnames');
			return callback(fnames);
		});
	});
};


//module exports
module.exports = 
{

	SALESFORCE_METADATA_API_VER : '33.0',

	pull: function(params, callback)
	{
		//constants
		if(params.orgtype == 0 || params.orgtype == 1)
		{
			var conn = new jsforce.Connection(
			{
				loginUrl: 'https://login.salesforce.com/'
			});
		}
		else
		{
			var conn = new jsforce.Connection(
			{
				loginUrl: 'https://test.salesforce.com/'
			});
		}

		conn.login(params.username, params.password+params.token, function(err, userInfo)
		{
			if(err)
			{
				ERROR_LOGIN.error = err;
				console.log(err);
				return callback(ERROR_LOGIN, null);
			}

			//retrieve metadata
			conn.metadata.retrieve({unpackaged: params.packagexml}, function(err, async)
			{
				if(err)
				{
					ERROR_PULLING_METADATA.error = async.status;
					console.log(err);
					return callback(ERROR_PULLING_METADATA, null);
				}

				SUCCESS_PULLING_METADATA.pullid = async.id;
				return callback(null, SUCCESS_PULLING_METADATA);
			});
		});
	},

	pullmetadata: function(params, callback)
	{
		module.exports.checkLogin(params, function(err, RESPONSE)
		{
			if(err)
			{
				console.log(err);
				return callback(err, null);
			}

			module.exports.newPackageDotXML(params, function(err, pullpackage)
			{
				if(err)
				{
					console.log(err);
					return callback(err, null);
				}
				
				//push package.xml to params
				params.packagexml = pullpackage;

				module.exports.pull(params, function(err, resp)
				{
					if(err)
					{
						return callback(err, null);
					}

					return callback(null, resp);
				});
			});
		});
	},

	getMetadataTypes: function(params, callback)
	{
		//connection vars
		if(params.orgtype == 0 || params.orgtype == 1)
		{
			var conn = new jsforce.Connection(
			{
				loginUrl: 'https://login.salesforce.com/'
			});
		}
		else
		{
			var conn = new jsforce.Connection(
			{
				loginUrl: 'https://test.salesforce.com/'
			});
		}

		conn.login(params.username, params.password+params.token, function(err, CONNECTION_INFORMATION)
		{
			if(err)
			{
				ERROR_LOGIN.error = err;
				console.log(ERROR_LOGIN);
				return callback(ERROR_LOGIN, null);
			}

			conn.metadata.describe(salesforce_api_ver, function(err, metadataxml)
			{
				if(err)
				{
					ERROR_DESCRIBE_METADATA.error = err;
					console.log(ERROR_DESCRIBE_METADATA);
					return callback(ERROR_DESCRIBE_METADATA, null);
				}

				console.log("200: Pulled metadata descriptions from org with ID: " + CONNECTION_INFORMATION.organizationId);
				SUCCESS_DESCRIBE_METADATA.metadata = metadataxml;
				return callback(null, SUCCESS_DESCRIBE_METADATA);
			});
		});
	},

	/*
	uses given string array of metadata names to create and return the package.xml 
	used in retrieve requests to salesforce.
	*/
	newPackageDotXML: function(metadata, callback)
	{
		console.log("in new packagedotxml");
		if(metadata.xmlnames.length > 0)
		{
			var package = 
			{
			   'types' : 
					[],
			        'version' : salesforce_api_ver
			};


			metadata.xmlnames.forEach(function(item)
			{
				if(item == 'EmailTemplate' || item == 'Report' || item == 'Document' || item == 'Dashboard')
				{}
				else
				{
					package.types.push(
					{
						'members' : '*',
					 	'name' : item
					});
				}
			});

			getFolderMetadata(metadata, function(namearray)
			{
				package.types.push(
				{
					'members' : namearray.emailnames,
				 	'name' : 'EmailTemplate'
				});
				package.types.push(
				{
					'members' : namearray.documentnames,
					'name' : 'Document'
				});
				package.types.push(
				{
					'members' : namearray.reportnames,
					'name' : 'Report'
				});
				package.types.push(
				{
					'members' : namearray.dashboardnames,
					'name' : 'Dashboard'
				});

				console.log(package);
				return callback(null, package);
			});
		}
		else
		{
			ERROR_PULLING_METADATA.error = "Error: No Metadata types selected.";
			return callback(ERROR_PULLING_METADATA, null);
		}
	},

	/*
	checks status of a retrieve() request with retrieve request id.
	returns an appropriate response
	*/
	checkpullstatus: function(params, callback)
	{
		if(params.orgtype == 0 || params.orgtype == 1)
		{
			var conn = new jsforce.Connection(
			{
				loginUrl: 'https://login.salesforce.com/'
			});
		}
		else
		{
			var conn = new jsforce.Connection(
			{
				loginUrl: 'https://test.salesforce.com/'
			});
		}

		conn.login(params.username, params.password+params.token, function(err, CONNECTION_INFORMATION)
		{
			if(err)
			{
				ERROR_LOGIN.error = err;
				console.log(ERROR_LOGIN);
				return callback(ERROR_LOGIN, null);
			}

			conn.metadata.checkRetrieveStatus(params.pullid, function(err, pullStatus)
			{
				console.log(pullStatus);
				if(err)
				{
					ERROR_PULLING_METADATA.error = err;
					console.log(ERROR_PULLING_METADATA);
					return callback(ERROR_PULLING_METADATA, null);
				}
				if(pullStatus.status == 'InProgress')
				{
					INCOMPLETE_RETRIEVE.message = "Retrieve is in progress..."
					return callback(null, INCOMPLETE_RETRIEVE);
				}
				if(pullStatus.status == 'Queued')
				{
					INCOMPLETE_RETRIEVE.message = "Retrieve is in queue..."
					return callback(null, INCOMPLETE_RETRIEVE);
				}
				if(pullStatus.status == 'Succeeded')
				{
					awsParams = 
					{
						zipFile : pullStatus.zipFile,
						userid  : params.userid
					};
					uploadZip(awsParams);

					FINISHED_RETRIEVE.message = "Retrieve is complete."
					return callback(null, FINISHED_RETRIEVE);
				}
				if(pullStatus.status == 'Pending')
				{
					INCOMPLETE_RETRIEVE.message = "Retrieve is in pending..."
					return callback(null, INCOMPLETE_RETRIEVE);
				}
			});
		});
	},

	/*
		checkLogin() : uses JSForce Connection to determine the validity of the given user credentials

		local calls from:
			(no local calls)

		params:
			params <Object>
				.orgtype (required)
				.username (required)
				.password (required)
				.token (required)
			callback <Function>
				err (Object optional)
				response (Object optional)
	*/
	checkLogin : function(params, callback)
	{
		if(params.orgtype == 0 || params.orgtype == 1)
		{
			var conn = new jsforce.Connection(
			{
				loginUrl: 'https://login.salesforce.com/'
			});
		}
		else
		{
			var conn = new jsforce.Connection(
			{
				loginUrl: 'https://test.salesforce.com/'
			});
		}

		conn.login(params.username, params.password+params.token, function(err, CONNECTION_INFORMATION)
		{
			if(err)
			{
				ERROR_LOGIN.error = err;
				return callback(ERROR_LOGIN, null);
			}
			return callback(null, SUCCESS_LOGIN_CHECK);
		});
	},


	/*
		buCheckPullStatus: 
	*/
	buCheckPullStatus: function(params, callback)
	{
		if(params.orgtype == 0 || params.orgtype == 1)
		{
			var conn = new jsforce.Connection(
			{
				loginUrl: 'https://login.salesforce.com/'
			});
		}
		else
		{
			var conn = new jsforce.Connection(
			{
				loginUrl: 'https://test.salesforce.com/'
			});
		}

		conn.login(params.username, params.password+params.token, function(err, CONNECTION_INFORMATION)
		{
			if(err)
			{
				ERROR_LOGIN.error = err;
				console.log(ERROR_LOGIN);
				return callback(ERROR_LOGIN, null);
			}

			conn.metadata.checkRetrieveStatus(params.pullid, function(err, pullStatus)
			{
				if(err)
				{
					ERROR_PULLING_METADATA.error = err;
					console.log(ERROR_PULLING_METADATA);
					return callback(ERROR_PULLING_METADATA, null);
				}
				if(pullStatus.status == 'Pending')
				{
					INCOMPLETE_RETRIEVE.message = "Retrieve is in pending..."
					return callback(null, INCOMPLETE_RETRIEVE);
				}
				else if(pullStatus.status == 'InProgress')
				{
					INCOMPLETE_RETRIEVE.message = "Retrieve is in progress..."
					return callback(null, INCOMPLETE_RETRIEVE);
				}
				else if(pullStatus.status == 'Queued')
				{
					INCOMPLETE_RETRIEVE.message = "Retrieve is in queue..."
					return callback(null, INCOMPLETE_RETRIEVE);
				}
				else if(pullStatus.status == 'Succeeded')
				{
					var date = new Date();
					awsParams = 
					{
						zipFile   : pullStatus.zipFile,
						userid    : params.userid,
						orgid	  : params.username,
						timestamp : date
					};
					uploadZip(awsParams);

					FINISHED_RETRIEVE.message = "Retrieve is complete."
					return callback(null, FINISHED_RETRIEVE);
				}
			});
		});
	},

	buListS3 : function(params, callback)
	{
		var s3 = new aws.S3();
		
		var s3params = 
		{
		  	Bucket: 'here2there',
		  	Prefix: 'scheduled_backup/'+params.userid
		};

		s3.listObjects(s3params, function(err, data) 
		{
		  	if (err) return callback(err, null);

		  	var keys = [];
		  	async.each(data.Contents, function(obj, asynccallback) 
		  	{
		  		console.log('Key: '+obj.Key);
		  		var clean = obj.Key.split('/'+params.userid+':')[1];
		  		console.log('woSP: '+clean);



			 	keys.push(clean);

			    asynccallback();
			}, function(err)
			{
			    if( err ) 
			    {
				    console.log(err);
			    } 
			    else 
			    {
		  			console.log(keys);
		  			return callback(null, keys);
			    }
			});
		});
	},
	buGetObjectS3 : function(params, callback)
	{
		var s3 = new aws.S3();
		
		var params = 
		{
		  	Bucket: 'here2there',
		  	Key: 'scheduled_backup/'+params.userid + ':'+params.path
		};

		console.log('insfhere');

		s3.getObject(params, function(err, data) 
		{
 			if (err) 
 				return callback(err, null);
  			else 
  			{
  				console.log(data);
  				var dataBuffer = data.Body;

  				return callback(null, dataBuffer.toString());
  			}
  		});
	}
};
//end module exports








