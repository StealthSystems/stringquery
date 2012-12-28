# StringQuery: DOM control through PHP
______________________________________

Building a dynamic site? Like, REALLY dynamic? So dynamic, that writing the javascript code to account for the various ajax responses would be incredibly tedious? Well, this PHP/JS framework should help.

What is it?
-----------

It's two things: a JavaScript object (along with some jQuery event hooks) and a PHP class. Combined, it allows you to manipulate several aspects of the DOM via instructions sent from your server. Both are incredibly extendable, allowing you to build on top of it to easily meet your needs.

How Does it Work?
-----------------

In short, JavaScript will ping a specified script on the server, posting an action and data value. When processed, it sends back a JSON object similar to the following:

    {
        i: <instrution data>{
            target: {
                property: value
            }
        }
        r: <repeat boolean>
        u: <update interval>
        k: <session key>
        t: <execution time>
        v: <verbose boolean>
    }

More one how this is built, sent and processed below.

StringQuery.php
--------------

The PHP class creates and tracks StringQuery sessions (these are tied to the page load; allowing multiple sessions to exist comming from a single browser through multiple tabs/windows), as well as processes the $_POST['action'] value and finds the appropriate function to call and send the data to.

### Creating and instance of StringQuery

    include('StringQuery.php');
	
    $SQ = new StringQuery(array(
        'repeat' => false,
        'actions' => array(
            'ping' => 'my_ping_function',
            'dostuff' => 'my_dostuff_function',
        )
    ));

Just pass an array of configurations, including an array of actions in action => function format

#### Available Configurations

- $repeat = true
  - If true, JavaScript will reping the server with that action/data after processing the instructions.
- $forced = false
  - If true, send all instructions even if they've already been sent before.
- $verbose = false
  - If true, JavaScript will log every step it goes through while processing the instructions.
- $min_update_interval = 0
  - If $repeat is true, this value will be added onto the $update_interval value
- $actions
  - An array of action values and the name of the function to run (must be a function name; other callback types not yet supported. See Bugs & Limitations for details

You can of course override these properties whenever. The most common example is enabling repeat for only the ping action:

    $SQ->repeat = true;

#### Construction Process

When constructed, StringQuery goes through the following steps:
1. Log the start time
2. Create or load the session key
3. Clean out any old sessions (nothing touched in 60 seconds by default)
4. Determin the server load and adjust the $update_interval property accordingly
5. Load the passed arguments array values into it's properties
6. Process the StringQuery data recieved, calling the function associated with the action if it exists
7. Reply back with the JSON instructions and exit

### Writing Action Functions

Action functions will be called with the following arguments (in order):
- StringQuery &$SQ; The StringQuery object, passed by reference
- mixed $data; The data attached to the action
- string $action; the name of the action called (for functions that handle multiple actions)

Here's what your action function would look like:

    function my_ping_action(&$SQ, $data, $action){
        //Do stuff with $data
    }

From there, just process the data received and do what needs to be done, which reminds me...

### Making Changes to the DOM

As explained above, StringQuery sends back instructions in the form of a JSON object, with the following syntax

    {
        target: {
            property: value
        }
    }

These instructions can be sent through various methods. All these methods include a $force boolean. Setting $force to true or false will override the global $force property, allowing you to force or not force a single change. All the functions use this property. These methods all have the same result; they just simply allow the instructions to be built differently.

Here are the 4 built in methods:

#### update($target, $data, $force = null)

    $SQ->update(
        '#mytarget',
        array(
            'innerHTML' => 'Hey, I changed!',
            'addClass' => 'changed'
        )
    );

#### updateProp($target, $prop, $value, $force = null)

    $SQ->updateProp(
        '#mytarget',
        'innerHTML',
        'Hey, I changed!'
    )

#### call(integer $key, $data, $force = null)

    $SQ->call('@alert', 'Hi there!');

Note: this works very similarly to update, however it will overwrite any preexisting entries in the instructions for the desired target rather than appending the data (this is because they're intended to only be called once per set)

#### bulkUpdate(array $targets, $force = null)

    $SQ->bulkUpdate(array(
        '#mytarget' => array(
            'innerHTML' => 'Hey, I changed!',
            'addClass' => 'changed'
        ),
        '@alert' => 'Hi there?'
    ));

Once that's all done, StringQuery will then build the response and send echo the JSON object, and finally exit so nothing else gets added after it.

### StringQuery::systemLoad()

The StringQuery class includes a method used to determine the load on the server, and is run during the construction call and right before sending the JSON. This allows it to dynamically adjust the $update_interval and minimize the chances of StringQuery triggering an accidental DDOS on your own site. It determins the server load one of 2 ways:

- Using the /proc/loadavg file
- Using the uptime command

If neither method is available, StringQuery defaults to assume the server load is relatively low. It then assigns a random value between two numbers to the $update_interval variable; the range determined by the server load.

You are encouraged to write your own extension of StringQuery so that you can define your own version of systemLoad(), just make sure you set a value for the $update_interval variable; the function is not intended to return a value. The one currently in place is based on a 4 core server, which might not be at all like what you're implementing it on.

### Extending

This is going to be brief, since honestly it's the same as extending any other PHP class; you can overwrite an existing function or add a new one that uses on the base ones, for instance:

    function changeTitle($text, $force = null){
        $this->updateProp('title', 'innerHTML', $text, $force);
    }

It's advised you use one of the builtin methods as an inbetween, since it's less likely to break if the actual system is reworked.

StringQuery.js
--------------

The JavaScript object sends action/data information to the server, and processes the instructions. All that's needed for basic setup is to call this function:

    StringQuery.init('/ajax.php');

This will set the StringQuery.script variable (the URL of the script to send all data to), and send the action 'ping' to the server, as well as any data you decide to pass in the second argument.

### Sending data

To send an action name and associated data to the server, and process the resulting instructions, simply call the sendData function:

    StringQuery.sendData('dostuff', 'with this');

StringQuery will build the request to make to the server:

    request = {
        action: 'dostuff',
        k: '9bf544bd1b7704bdefc7be441d9a21585848a32707deee946010f2ee7b776eea',
        data: 'with this'
    }
    
Note: k is the StringQuery session key, the MD5 of the clients IP address and the unix timestamp concated together. This is used to log previously sent instructions, to prevent bloating of the returned JSON.

### Receiving Data

When the data is processed on the server, StringQuery will expect some kind of JSON formatted response, described earlier.

#### Processing the Data

Assuming we get JSON back, StringQuery will proceed to do the following:

1. Reset the number of resend tries (if any were made before getting a response)
2. Make sure response is JSON, otherwise log and retry
3. Enable/Disable verbose mode based on response.v's value
4. Log data returned if in verbose mode
5. Store the key supplied by the server (will be the same key sent if there was one normally)
6. Process the instructions if they are provided
7. Setup to send to the server again if response.r (repeat) is true and response.u (update interval) is set
    - Note: if no update interval is set or repeat is not true, and if the action is 'ping', it will re-ping the server in 1 minute.
8. Log client & server execution time if in verbose mode

If there is an error with the request, StringQuery will log the error and retry until it succeeds, with the retry interval increasing every time.

#### Processing the Instruction

StringQuery will run through the instructions, target by target. First, it checks if the target is a special method function (prefixed with an @), or otherwise a selector of some kind (or possibly even html code).

If it's a special method, it will check if the method exists within StringQuery.methods and call it, otherwise it'll log an error (again, only logged if in verbose mode).

If it's a selector, it will create a jQuery object of the selector, and check if it exists based on the length. If it doesn't exist, it'll log an error in a similar way to the missing special method error.

If the selector matches something in the DOM, it will procceed to rung through each propery and process it accordingly using the StringQuery.process function.

##### StringQuery.process(p, v, e)

This function, which takes the propery, value, and element, proceeds to make the necessary changes based on what the property is:

- If it begins with 'data-' or belongs to the StringQuery.attributes list, it'll edit the attribute via jQuery.attr();
- If it belongs to the StringQuery.properties list, it'll edit the property via jQuery.prop();
- If it belongs to the StringQuery.functions list, it'll call/apply the the matching function based on the sublist it's in
    - noArg functions will just be called
    - oneArg functions will be called with the value passed to them
    - multiArg functions will be applied with the value passed as a list of arguments
- If not, it first checks if the property is the name of a function in StringQuery.utilities block, and calls it if so
    - If the function doesn't exists, it'll check if it's an alias to another utility function and call that if so
- If all else fails, it's probably a DOM property, and will edit it directly

### Extending

You can add your own special method functions to the StringQuery object like so:

    StringQuery.methods.mymethod = function(data){
        //do stuff
    }

And then all you need to do to call it from the server is to use the StringQuery::call method:

    $SQ->call('mymethod', 'my data');
    
Note: if you call this through StringQuery::update or StringQuery::bulkUpdate, make sure to prefix the method name with an @, so that the JavaScript object can tell it's a method and not some kind of jQuery selector.

You can also extend the StringQuery.function lists to add additional noArg, oneArg and multiArg jQuery functions, such as plugins.

	StringQuery.functions.multiArg.push('myplugin');
	
From the PHP side, you'd pass the instructions like so:

	$SQ->updateProp(
		'#myelement',
		'myplugin',
		array(
			'arg1',
			'arg2'
		)
	);
	
Note: when calling a noArg function, you should pass it as simply <code>'myplugin' => null</code>, since the value is ignored.

The same applies for extending the attributes and properties lists, and the various utility functions or aliases.

### Configurable Properties

StringQuery has a few properties that can be configured before or during the init() call.

#### StringQuery.script

This is the URL to the script StringQuery makes AJAX calls. Ideallu, this is set during init() and never changed, however there's nothing stopping you from having it change the script by passing an override to StringQuery.sendData();

#### StringQuery.retryPace

This is the base interval between retries to send a request to the server. In use, the value is slowly increased by 10% each try.

#### StringQuery.defaultData.[action]

As the name suggests, you can set a default value for the data to be sent for a particular action. This is usefull primarily in the case of the 'ping' action, allowing you to change the data being sent without reinitiating the request cycle.

### StringQuery forms

StringQuery.js includes a jQuery event handler for the submission of any form with the class <code>.string-query</code>. It sends the serialized form values as the data argument, and uses one of 2 sources for the action argument:

- An input with the name string_query_action (if present), or
- The value of the data-action attribute (as a fallback; if present)

This allows you to dynamically insert a form into the DOM, preprogrammed to trigger StringQuery.sendData() when they're submitted.

Copyright & Credits
-------------------

Copyright © 2012 Doug Wollison & Richard Cornwell

This software is provided 'as-is', without any express or implied
warranty.  In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
   claim that you wrote the original software. If you use this software
   in a product, an acknowledgment in the product documentation would be
   appreciated but is not required.
2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.

Doug Wollison (Zumoro) <doug@wollison.net>  
Richard Cornwell (RCP) <rcp@techtoknow.net>
