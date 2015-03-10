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
  	accessToken: '',
  	instanceUrl: '',
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
	pull: function(xmlpackage, userin, passin, secin, orgtype, callback)
	{
		//constants
		var username = userin;
		var password = passin;
		var secToken = secin;

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

		conn.login(username, password+secToken, function(err, userInfo)
		{
			if(err)
			{
				ERROR_LOGIN.error = err;
				console.log(err);
				return callback(ERROR_LOGIN, null);
			}

			console.log(conn);
			SUCCESS_PULLING_METADATA.accessToken = conn.accessToken;
			SUCCESS_PULLING_METADATA.instanceUrl = conn.instanceUrl;

			//retrieve metadata
			conn.metadata.retrieve({unpackaged: xmlpackage}, function(err, async)
			{
				if(err)
				{
					ERROR_PULLING_METADATA.error = async.status;
					console.log(err);
					return callback(ERROR_PULLING_METADATA, null);
				}

				conn.metadata.checkRetrieveStatus(async.id, function(err, result)
				{	
					if(err)
					{
						ERROR_PULLING_METADATA.error = err;
						console.log(err);
						return callback(ERROR_PULLING_METADATA, null);
					}
					//for logging purposes
					asynct(result);
				});

				SUCCESS_PULLING_METADATA.pullid = async.id;
				return callback(null, SUCCESS_PULLING_METADATA);
			});

			//constructor
			function asynct(pullStatus)
			{
				if(pullStatus.status == 'InProgress')
				{
					console.log("PullID: " + pullStatus.id + " is in progress...");
					conn.metadata.checkRetrieveStatus(pullStatus.id, function(err, newPullStatus)
					{
						asynct(newPullStatus);
					});
				}
				else if(pullStatus.status == 'Queued')
				{
					console.log("PullID: " + pullStatus.id + " is in queue...");
					conn.metadata.checkRetrieveStatus(pullStatus.id, function(err, newPullStatus)
					{
						asynct(newPullStatus);
					});
				}
				else if(pullStatus.status == 'Succeeded')
				{
					console.log("PullID: " + pullStatus.id + " was successfull...");
					
					//zipFile is base64 encoded
					//decode into buffer and push to AWS S3 bucket
					var buffer = new Buffer(pullStatus.zipFile, 'base64');					
					
					var s3obj = new aws.S3({params: {Bucket: 'here2there', Key: 'metadata.zip'}});
					s3obj.upload({Body: buffer}).
					  on('httpUploadProgress', function(evt) { console.log(evt); }).
					  send(function(err, data) { console.log(err, data) });
				}
				else if(pullStatus.status == 'Pending')
				{
					console.log("PullID: " + pullStatus.id + " is pending...");
					conn.metadata.checkRetrieveStatus(pullStatus.id, function(err, newPullStatus)
					{
						asynct(newPullStatus);
					});
				}
				else
				{
					console.log(pullStatus.status);
					return console.log("PullID: " + pullStatus.id + " has encountered an error or unknown exception");
				}
			}
			//end constructor
		});
	},

	pullmetadata: function(xmlnames, userin, passin, token, type, callback)
	{
		module.exports.createpackage(xmlnames, function(err, pullpackage)
		{
			if(err)
			{
				console.log(err);
				return callback(err);
			}

			module.exports.pull(pullpackage, userin, passin, token, type, function(err, resp)
			{
				if(err)
				{
					return err;
				}

				return callback(resp);
			});
		});
	},

	describemetadata: function(usernamein, passwordin, token, orgtype, callback)
	{
		//organization constants
		var username = usernamein;
		var password = passwordin;
		var secToken = token;
		

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

			//console.log(CONNECTION_INFORMATION);

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
	//end function

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
	checkpullstatus: function(accessToken, instanceUrl, usernamein, passwordin, token, orgtype, pullid, callback)
	{
		var testcon = new jsforce.Connection(
			{
				serverUrl : instanceUrl,
  				sessionId : accessToken
			});
		testcon.login(usernamein, passwordin+token, function(err, CONNECTION_INFORMATION)
		{
			if(err)
			{
				return console.log(err);
			}
			console.log("intest");

			testcon.metadata.checkRetrieveStatus(pullid, function(err, pullStatus)
			{	
				/*
					err is thrown if pull has completed, even if pullid is/was a valid id.
					because of this, I am returning a FINISHED_RETRIEVE response to the client
					this is a problem with the Salesforce Metadata API
				*/
				if(err)
				{
					console.log(err);
					return callback(FINISHED_RETRIEVE);
					//console.log(err);
					//ERROR_PULLING_METADATA.error = err;
					//return callback(ERROR_PULLING_METADATA);
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

		conn.login(usernamein, passwordin+token, function(err, CONNECTION_INFORMATION)
		{
			if(err)
			{
				ERROR_LOGIN.error = err;
				console.log(ERROR_LOGIN);
				return callback(ERROR_LOGIN);
			}


		});
	}
};
//end module exports




