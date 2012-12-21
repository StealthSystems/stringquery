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

    $SQ->call(1, 'Hi there!');

Note: this works very similarly to update, however it will overwrite any preexisting entries in the instructions for the desired target rather than appending the data (this is because they're intended to only be called once per set)

#### bulkUpdate(array $targets, $force = null)

    $SQ->bulkUpdate(array(
        '#mytarget' => array(
            'innerHTML' => 'Hey, I changed!',
            'addClass' => 'changed'
        ),
        1 => 'Hi there?'
    ));

Once that's all done, StringQuery will then build the response and send echo the JSON object, and finally exit so nothing else gets added after it.

### Extending

This is going to be brief, since honestly it's the same as extending any other PHP class; you can overwrite an existing function or add a new one that uses on the base ones, for instance:

    function changeTitle($text, $force = null){
        $this->updateProp('title', 'innerHTML', $text, $force);
    }

It's advised you use one of the builtin methods as an inbetween, since it's less likely to break if the actual system is reworked.

___________
Documentation in progress... need to rename the damn thing now apparently anyway.
