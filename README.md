# StringQuery: DOM control through PHP
_____________________________________

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
