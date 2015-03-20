# salesforce-here
asynchronously streamlining the retrieval and cloud-based storage of Salesforce Metadata components since 2015.

with the sibling module salesforce-there, a complete solution for Salesforce Metadata Migration is formed.

#what is it
salesforce-here is a high-level asynchronous library that runs on the Node.js framework.
it asyncronously retrieves and stores selected metadata components from a Salesforce Organization
on the AWS S3 cloud computing services platform.


# Install

```sh
$ git clone http://github.com/benkrig/salesforce-here.git
```

Add to package.json: 
```json
"dependencies": {
    "salesforce-here": "git+https://git@github.com/benkrig/salesforce-here.git",
},
```

Use:

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
	set up constants in /lib/salesforce-here.js or process.env.~
	
	to: 

	AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY;
    AWS_SECRET_KEY = process.env.AWS_SECRET_KEY;
	S3_BUCKET = process.env.S3_BUCKET;
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
