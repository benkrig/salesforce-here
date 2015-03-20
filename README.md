# salesforce-here
Asynchronously streamlining the retrieval and cloud-based storage of Salesforce Metadata components since 2015.

With the sibling module salesforce-there, a complete solution for Salesforce Metadata Migration is formed.

#what is it
Salesforce-here is a high-level asynchronous library that runs on the Node.js framework.

Salesforce-here asyncronously retrieves the selected metadata components of a Salesforce Organization and 
pushes the components to the AWS S3 cloud computing services platform for storage.


# install

Type
```sh
$ git clone http://github.com/benkrig/salesforce-here.git
```
Then add to package.json: 
```json
"dependencies": {
    "salesforce-here": "git+https://git@github.com/benkrig/salesforce-here.git",
},
```

# use

```node
var sfhere = require('salesforce-here');

/*
	describe organization metadata types
*/
var params = 
{
	//salesforce organization credentials
    'username' : 'username',
    'password' : 'password',
    'token'    : 'token',
    
    /*
    	orgtypes~
    	'0' : production
    	'1' : development
    	'2' : sandbox
    */
    'orgtype'  : 'Integer~0,1,2',
};

sfhere.getMetadataTypes(params, function(err, response)
{
    if(err) return console.log(err);

    return console.log(response.metadata);
});
//--


/*
	pull metadata to AWS S3

	first set up AWS S3 constants,

		(manual)
		to manually setup change /lib/salesforce-here.js:
			AWS_ACCESS_KEY = 'putaccesskey';
   	 		AWS_SECRET_KEY = 'putsecretkey';
			S3_BUCKET = 'putbucketname';
		
		(default) 
		change  process.env.~ config vars using
			$heroku config:set AWS_ACCESS_KEY='putaccesskey'
*/
var params = 
{
    //salesforce organization credentials
    'username' : 'username',
    'password' : 'password',
    'token'    : 'token',
    
    /*
    	orgtype~
    	'0' : production
    	'1' : development
    	'2' : sandbox
    */
    'orgtype'  : 'Integer~0,1,2',

    /*
    	metadata types~

    	https://www.salesforce.com/us/developer/docs/api_meta/Content/meta_types_list.htm
    */
	'xmlnames' : 'String~Metadata || Array.<String~Metadata>'
};

sfhere.pullmetadata(params, function(err, response)
{
	if(err)
	{
		return console.log(err);
	}

	return console.log(response.message);
});
//--
```

Created by Benjamin Krig
Copyright (c) 2015 Benjamin Krig
