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
}

var FINISHED_RETRIEVE =
{
	statuscode: '600',
  	message: 'Finished retrieving Metadata.',
}

var INCOMPLETE_RETRIEVE =
{
	statuscode: '700',
  	message: 'Still retrieving Metadata...',
}
//end responses


//module exports
module.exports = 
{

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
		module.exports.createpackage(params.xmlnames, function(err, pullpackage)
		{
			if(err)
			{
				console.log(err);
				return callback(err);
			}
			
			console.log(params);
			//push package.xml to params
			params.packagexml = pullpackage;

			module.exports.pull(params, function(err, resp)
			{
				if(err)
				{
					return err;
				}

				return callback(resp);
			});
		});
	},

	describemetadata: function(params, callback)
	{
		//organization constants
		var username = params.username;
		var password = params.password;
		var secToken = params.token;
		var orgtype  = params.orgtype;
		

		//connection vars
		if(orgtype == 0 || orgtype == 1)
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

		conn.login(username, password+secToken, function(err, CONNECTION_INFORMATION)
		{
			if(err)
			{
				ERROR_LOGIN.error = err;
				console.log(ERROR_LOGIN);
				return callback(ERROR_LOGIN);
			}

			console.log(CONNECTION_INFORMATION);

			conn.metadata.describe(salesforce_api_ver, function(err, metadataxml)
			{
				if(err)
				{
					ERROR_DESCRIBE_METADATA.error = err;
					console.log(ERROR_DESCRIBE_METADATA);
					return callback(ERROR_DESCRIBE_METADATA);
				}

				console.log("200: Pulled metadata descriptions from org with ID: " + CONNECTION_INFORMATION.organizationId);
				SUCCESS_DESCRIBE_METADATA.metadata = metadataxml;
				return callback(SUCCESS_DESCRIBE_METADATA);
			});
		});
	},

	/*
	uses given string array of metadata names to create and return the package.xml 
	used in retrieve requests to salesforce.
	*/
	createpackage: function(xmlnames, callback)
	{
		if(xmlnames.length > 0)
		{
			var package = 
			{
			   'types' : 
					[],
			        'version' : salesforce_api_ver
			};

			for(var i = 0; i < xmlnames.length; i ++)
			{
				package.types.push(
				{
					'members' : '*',
				 	'name' : xmlnames[i]
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
		var username = params.username;
		var password = params.password;
		var token    = params.token;
		var orgtype  = params.orgtype;
		var pullid   = params.pullid;

		if(orgtype == 0 || orgtype == 1)
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

		conn.login(username, password+token, function(err, CONNECTION_INFORMATION)
		{
			if(err)
			{
				ERROR_LOGIN.error = err;
				console.log(ERROR_LOGIN);
				return callback(ERROR_LOGIN);
			}

			conn.metadata.checkRetrieveStatus(pullid, function(err, pullStatus)
			{
				if(err)
				{
					ERROR_PULLING_METADATA.error = err;
					console.log(ERROR_PULLING_METADATA);
					return callback(ERROR_PULLING_METADATA);
				}
				if(pullStatus.status == 'InProgress')
				{
					INCOMPLETE_RETRIEVE.message = "Retrieve is in progress..."
					return callback(INCOMPLETE_RETRIEVE);
				}
				if(pullStatus.status == 'Queued')
				{
					INCOMPLETE_RETRIEVE.message = "Retrieve is in queue..."
					return callback(INCOMPLETE_RETRIEVE);
				}
				if(pullStatus.status == 'Succeeded')
				{
					INCOMPLETE_RETRIEVE.message = "Retrieve is complete."
					return callback(FINISHED_RETRIEVE);
				}
				if(pullStatus.status == 'Pending')
				{
					INCOMPLETE_RETRIEVE.message = "Retrieve is in pending..."
					return callback(INCOMPLETE_RETRIEVE);
				}
			});
		});
	}
};
//end module exports




