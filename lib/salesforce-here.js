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
uploadZip: uploads the raw binary data package in the for of a buffer to AWS S3 storage.
this is stored for a maximum of one (1) day

*/
var uploadZip = function (encodedZip)
{
	var binaryObj = new Buffer(encodedZip.zipFile, 'base64');
	var s3obj = new aws.S3({params: {Bucket: 'here2there', Key: 'metadata.zip'}});
	
	s3obj.upload({Body: binaryObj})
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
	if(Array.isArray(response))
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
	uses a JSForce Connection, a getFolder() callback Object<folders> and returns an array of filenames

	JSForce.metadata.list(query<Object>|query<ObjectArray>, callback) has a limit of three (3)
	queries per .list execution. 

	To work with this we use the async.js module's .whilst() to continuously
	Array.splice() three (3) query objects into a chunk from the query array and execute a JSForce .list() on
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
						}

						if(resp)
						{
							//array
							if(Array.isArray(resp))
							{
								async.each(resp, function (item, eachcallback)
								{ 
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
								filenames.push(resp.fullName);
								callback();
							}
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
				return err;
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
		if(metadata.xmlnames.length > 0)
		{
			var package = 
			{
			   'types' : 
					[],
			        'version' : salesforce_api_ver
			};

			module.exports.testfun(metadata, function(err, namearray)
			{
				if(err)
				{
					console.log(err);
				}

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
					params = 
					{
						zipFile : pullStatus.zipFile
					};
					uploadZip(params);

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
		login information has already been verified, no need to check or handle error

	*/
	testfun : function(params, callback)
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

			var qemailtemplate=
			{
				type: ''
			};
			var qdocument=
			{
				type: ''
			};
			var qdashboard=
			{
				type: ''
			};
			var qreport=
			{
				type: ''
			};

			var fnames = 
			{
				emailnames : [],
				reportnames : [],
				documentnames : [],
				dashboardnames : []
			};

			if(params.xmlnames.indexOf("EmailTemplate") > -1)
			{
				qemailtemplate.type = "EmailFolder";
			}
			if(params.xmlnames.indexOf("Document") > -1)
			{
				qdocument.type = "DocumentFolder";
			}
			if(params.xmlnames.indexOf("Dashboard") > -1)
			{
				qdashboard.type = "DashboardFolder";
			}
			if(params.xmlnames.indexOf("Report") > -1)
			{
				qreport.type = "ReportFolder";
			}

			conn.metadata.list(qemailtemplate,function(err,eres)
			{
				var rsp = eres;

				//type not found
				if (err) 
				{ 
					console.log(err); 
				}

				getFolders(rsp, function(efolders)
				{
					var efold = efolders;
					getFileNames(conn, efold, function(efilenames)
					{
						console.log("got emails");
						fnames.emailnames = efilenames;

						conn.metadata.list(qdocument,function(err,dres)
						{

							//type not found
							if (err) 
							{ 
								console.log(err); 
							}
							getFolders(dres, function(dfolders)
							{
								getFileNames(conn, dfolders, function(dfilenames)
								{
									console.log("got docs");
									fnames.documentnames = dfilenames;

									conn.metadata.list(qreport,function(err,eres2)
									{
										if (err) 
										{ 
											console.log(err); 
										}

										getFolders(eres2, function(efolders2)
										{
											getFileNames(conn, efolders2, function(efilenames2)
											{
												console.log("got reports");
												fnames.reportnames = efilenames2;

												conn.metadata.list(qdashboard,function(err,dashres)
												{
													if(err)
													{
														console.log(err);
													}

													getFolders(dashres, function(dashboardfolders)
													{
														getFileNames(conn, dashboardfolders, function(dashboardfilenames)
														{
															console.log("got dash");
															fnames.dashboardnames = dashboardfilenames;

															return callback(null, fnames);
														});
													});
												});
											});
										});
									});			
								});
							});
						});
					});
				});
			});
		});
	}
};
//end module exports




