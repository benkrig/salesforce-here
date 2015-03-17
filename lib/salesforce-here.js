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
		module.exports.newPackageDotXML(params.xmlnames, function(err, pullpackage)
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

			console.log(CONNECTION_INFORMATION);

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

			var lstquery=
			[
				{
					type:'EmailTemplate'
				},
				{
					type:'CustomField'
				}
			];

			conn.metadata.list(lstquery,function(error,res)
			{
				if (err) { return console.error(err); }
				console.log(res);
			});
		});
	},

	/*
	uses given string array of metadata names to create and return the package.xml 
	used in retrieve requests to salesforce.
	*/
	newPackageDotXML: function(metadata, callback)
	{
		if(metadata.length > 0)
		{
			var package = 
			{
			   'types' : 
					[],
			        'version' : salesforce_api_ver
			};

			for(var i = 0; i < metadata.length; i ++)
			{
				package.types.push(
				{
					'members' : '*',
				 	'name' : metadata[i]
				});
			}
			return callback(null, package);
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
	}
};
//end module exports




