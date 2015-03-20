# salesforce-here
Node.js module that streamlines the retrieval and storage of Salesforce Metadata


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


//describe organization metadata types
var params = 
{
	//salesforce organization credentials
    'username' : 'username',
    'password' : 'password',
    'token'    : 'token',
    
    //orgtypes
    //'0' : production
    //'1' : development
    //'2' : sandbox
    'orgtype'  : 'Integer<0,1,2>',
};

sfhere.getMetadataTypes(params, function(err, response)
{
    if(err) return console.log(err);

    return console.log(response.metadata);
});
//--


//pull metadata to AWS S3
var params = 
{
    //salesforce organization credentials
    'username' : 'username',
    'password' : 'password',
    'token'    : 'token',
    
    //orgtypes
    //'0' : production
    //'1' : development
    //'2' : sandbox
    'orgtype'  : 'int',

    //metadata types
	'xmlnames' : 'Metadata~String | Array.<Metadata~String>'
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
