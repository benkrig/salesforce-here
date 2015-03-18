/*
salesforce-here.js
salesforce-here is a module that streamlines the RETRIEVAL and STORAGE of Salesforce Metadata.
metadata is stored in AWS-S3 cloud storage.


Copyright (c) Benjamin Krig 2015

*/

//modules
var jsforce = require('jsforce');
var aws = require('aws-sdk');


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

var uploadZip = function (object)
{
	var buffer = new Buffer(object.zipFile, 'base64');
	var s3obj = new aws.S3({params: {Bucket: 'here2there', Key: 'metadata.zip'}});
	
	s3obj.upload({Body: buffer})
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
	takes a listMetadata() response and returns an array of folder names
*/
var getFolders = function(response, callback)
{
	var folders = 
	{
		names: [],
		type: ''
	};

	//null
	if(response == null)
	{
	}
	//array
	if(Array.isArray(response))
	{
		response.forEach(function(item)
		{
			folders.names.push(item.fullName);
		});
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
		return callback(folders)
	}
	//obj
	else
	{
		folders.names.push(response.fullName);
		if(response.type == 'EmailFolder')
		{
			folders.type = 'EmailTemplate';
			return callback(folders);

		}
		if(response.type == 'DashboardFolder')
		{
			folders.type = 'Dashboard';
			return callback(folders);

		}
		if(response.type == 'ReportFolder')
		{
			folders.type = 'Report';
			return callback(folders);
		}
		if(response.type == 'DocumentFolder')
		{
			folders.type = 'Document';
			return callback(folders);
		}		
	}
};

var getFileNames = function(conn, folders, callback)
{
	var query = [];
	var done = 0;
	var filenames = [];

	folders.names.forEach(function(item)
	{
		console.log(folders.names.type)
		query.push({type: folders.type, folder: item});
	});

	while(query.length > 0) 
	{
		console.log(query.length);
	  	var chunk = query.splice(0,3);

	  	if(query.length == 0)
	  	{
	  		done = 1;
	  	}

	  	conn.metadata.list(chunk, function(err, resp)
		{
			if(err) return console.log(err);	
			
			if(resp)
			{
				if(Array.isArray(resp))
				{
					resp.forEach(function(item)
					{
						filenames.push(item.fullName);
					});
				}
				else
				{
					filenames.push(resp.fullName);
				}

				if(done == 1)
				{
					return callback(filenames);
				}
			}
			else
			{
				return callback(filenames);
			}
		});
	}
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

			metadata.xmlnames.forEach(function(item)
			{
				if(item == 'EmailTemplate')
				{
					module.exports.testfun(metadata, function(namearray)
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
					
					/*var buffer = new Buffer(pullStatus.zipFile, 'base64');					
					
					var s3obj = new aws.S3({params: {Bucket: 'here2there', Key: 'metadata.zip'}});
					s3obj.upload({Body: buffer}).
					  on('httpUploadProgress', function(evt) { console.log(evt); }).
					  send(function(err, data) { console.log(err, data) });*/

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
				console.log(ERROR_LOGIN);
				return callback(ERROR_LOGIN, null);
			}

			return callback(null, SUCCESS_LOGIN_CHECK);
		});
	},

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
			if(err)
			{
				ERROR_LOGIN.error = err;
				console.log(ERROR_LOGIN);
				return callback(ERROR_LOGIN, null);
			}

			var lstquery=
			{
				type: 'EmailFolder'
			};
			var dquery=
			{
				type: 'DocumentFolder'
			};
			var dashboardq=
			{
				type: 'DashboardFolder'
			};
			var reportq=
			{
				type: 'ReportFolder'
			};

			var fnames = 
			{
				emailnames : [],
				reportnames : [],
				documentnames : [],
				dashboardnames : []
			};

			conn.metadata.list(lstquery,function(err,eres)
			{
				if (err) 
				{ 
					return console.log(err); 
				}

				getFolders(eres, function(efolders)
				{
					getFileNames(conn, efolders, function(efilenames)
					{
						console.log("got emails");
						fnames.emailnames = efilenames;

						conn.metadata.list(reportq,function(err,eres2)
						{
							if (err) 
							{ 
								return console.log(err); 
							}

							getFolders(eres2, function(efolders2)
							{
								getFileNames(conn, efolders2, function(efilenames2)
								{
									console.log("got reports");
									fnames.reportnames = efilenames2;

									conn.metadata.list(dquery,function(err,dres)
									{
										if (err) 
										{ 
											return console.log(err); 
										}
										getFolders(dres, function(dfolders)
										{
											getFileNames(conn, dfolders, function(dfilenames)
											{
												console.log("got docs");
												fnames.documentnames = dfilenames;

												conn.metadata.list(reportq,function(err,qres)
												{
													if (err) 
													{
														return console.log(err); 
													}
													getFolders(qres, function(qfolders)
													{
														getFileNames(conn, qfolders, function(qfilenames)
														{
															console.log("got dashes");
															fnames.dashboardnames = qfilenames;

															return callback(fnames);
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




