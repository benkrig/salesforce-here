async.whilst(
    function () { return query.length > 0; },
    function (callback) 
    {
        var chunk = query.splice(0,3);
        conn.metadata.list(chunk, function(err, resp)
		{
			if(err) 
			{
				return console.log(err);	
			}
					
			if(resp)
			{
				if(Array.isArray(resp))
				{
					async.each(resp, function (item, cback)
					{ 
			        	console.log('***** ' + item.fullName);
						filenames.push(item.fullName);
			        	cback();
				    }, function(err) 
				    {
				    	if(err)
				    	{

				    	}
				    	else
				    	{
				    		console.log("whilstforeach callback");
				    		cback();
				    	}
				    });
				}
				else
				{
					console.log(resp.fullName);
					filenames.push(resp.fullName);
					callback();
				}
			}
		});
    },
    function (err) 
    {
    	//whilst is done
    	console.log("whilst callback bitch");
    	return callback(filenames);
    }
);



while(query.length > 0) 
			{
				console.log(query.length);
			  	var chunk = query.splice(0,3);

			  	conn.metadata.list(chunk, function(err, resp)
				{
					if(err) 
					{
						return console.log(err);	
					}
					
					if(resp)
					{
						if(Array.isArray(resp))
						{

							resp.forEach(function(item)
							{
								console.log(item.fullName);
								filenames.push(item.fullName);
							});
						}
						else
						{
							console.log(resp.fullName);
							filenames.push(resp.fullName);
						}

						if(done == 1)
						{
							console.log("if done == 1");
							return callback(filenames);
						}
					}
					else
					{
						console.log("else return fnames");
						return callback(filenames);
					}
				});
			}