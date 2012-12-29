<?php
/*
Built with StringQuery (https://github.com/dougwollison/marionette/)

Copyright (c) 2012 Doug Wollison & Richard Cornwell
For conditions of distribution and use, see copyright notice in LICENSE
*/

/**
 * StringQuery is a 2 pronged system for manipulating the DOM.
 * This PHP class is used to build an array of instructions
 * for the JS class to follow and make changes to the DOM.
 *
 * Instructions are sent in this basic structure:
 * {
 * 		target: {
 * 			prop: value
 * 		}
 * }
 *
 * target:	a jQuery selector (to directly edit an element)
 * 			or a number to call a predefined parser function
 * 			within the JS class.
 * 			(set via StringQuery.parsers[@NAME] = function(){//do something})
 *
 * prop:	a DOM property or attribute to manipulate through
 * 			jQuery or directly through the DOM object. This can
 * 			also be the name of a jQuery function such as addClass,
 * 			or a predefined parser function.
 * 			(set via StringQuery.parsers.X = function(){//do something})
 *
 * value:	mixed data, such as a boolean, a string, or an object.
 * 			For jQuery functions that take multiple arguments, pass
 * 			an array of the arguments.
 * 			(set via StringQuery.functions.[oneArg|multiArg|noArg].X = function(){//do something})
 *
 * These instructions are then sent back in the form of a JSON object,
 * which is composed of the following:
 * {
 * 		i: <instrution data>
 * 		r: <repeat boolean>
 * 		u: <update interval>
 * 		k: <session key>
 * 		t: <execution time>
 * 		v: <verbose boolean>
 * }
 *
 * instruction data:	The instructions for what changes to make to the DOM
 *
 * repeat boolean:		Wether or not to repeat this action again; this
 * 						is for something like a ping action that regularly
 * 						checks if there are new changes available
 *
 * update interval:		How long for the JS class to wait before sending
 * 						again, assuming repeat is TRUE
 *
 * session key:			The key of StringQuery's $_SESSION entry that this
 * 						particulat connection is related to.
 *
 * execution time:		An estimate of how long it took the server to execute
 * 						this, used in the debug logs if verbose is true.
 *
 * verbose boolean:		Wether or not to log debug messages in the console,
 * 						useful in tracking down what data was sent back and
 * 						ensuring it's processed properly
 *
 * StringQuery's uses a section of the $_SESSION variable to store
 * information such as previously sent instructions so as to cut out
 * redundant changes (unless they are marked as forced, in which
 * case it will send that change no matter what).
 *
 * StringQuery's session variable supports multiple instances; if
 * the user has multiple windows open, the changes will only affect
 * the specific window. In an attempt to prevent memory hogging,
 * StringQuery regularly clears out sessions that haven't been touched
 * for the last 60 seconds.
 */
ini_set('session.use_cookies', 1);
ini_set('session.use_only_cookies', 1);

class StringQuery
{
	public $repeat = false; //specify that pings for this should be repeated
	public $forced = false; //Default force setting
	public $verbose = false; //Default js verbose setting
	public $min_update_interval = 0; //The minimum update interval, added to the actual upate_interval
	public $actions = array(); //List of function calls for each action

	public $data = array(); //For collecting multiple replies to send
	public $force = array(); //For forcing changes on any targets logged here.
	public $update_interval = 1000; //How long to wait before repeating if repeat is TRUE
	public $session_lifetime = 60; //How many seconds a session can last without being touched before getting deleted
	public $start; //The start time of when StringQuery was initialized
	public $key; //The session entry key that holds relevant StringQuery data

	function make_key(){
		//Set the key to either be the one passed in the AJAX call, or create one based on their IP and the microtime
		if(!empty($_REQUEST['StringQuery']['k']) && $_REQUEST['StringQuery']['k'] != 'null'){
			$this->key = $_REQUEST['StringQuery']['k'];
		}else{
			$this->key = md5($_SERVER['REMOTE_ADDR']).md5(microtime());
		}

		//Check if StringQuery data is setup for this session, setup with birth time if not
		if(!isset($_SESSION['StringQuery'][$this->key]) || !is_array($_SESSION['StringQuery'][$this->key]))
			$_SESSION['StringQuery'][$this->key] = array(
				'birth' => time()
			);

		//Set/Update the touched timestamp on this session to renew it
		$_SESSION['StringQuery'][$this->key]['touched'] = time();
	}

	function clean_session(){
		//Run through all sessions and see if any are older than 60 seconds, delete if so
		foreach($_SESSION['StringQuery'] as $key => $session){
			if($key != $this->key && isset($session['touched']) && time() - $session['touched'] > $this->session_lifetime)
				unset($_SESSION['StringQuery'][$key]);
		}
	}

	function __construct($args){
		$this->start = microtime(true);

		//Generate/Load session key and clean out the session
		$this->make_key();
		$this->clean_session();

		//Check the system load and adjust the update interval accordingly
		$this->sysLoadTime();

		foreach($args as $arg => $value){
			$this->$arg = $value;
		}

		//If StringQuery data is sent to the server, process it based on the action parameter
		if(isset($_REQUEST['StringQuery'])){
			header('HTTP/1.0 200 OK');
			//If no action is actually passed, send log to the browser
			if(!isset($_REQUEST['StringQuery']['action'])) $this->call('log', "No action specified", true, false);

			$action = $_REQUEST['StringQuery']['action'];

			$data = null;
			if(isset($_REQUEST['StringQuery']['data'])) $data = $_REQUEST['StringQuery']['data'];

			if(isset($this->actions[$action])){
				//An processor function for this action is set, call the function.
				$func = $this->actions[$action];
				$func($this, $data, $action);
				//call_user_func($this->actions[$action], &$this, $data, $action);
			}elseif(isset($this->actions['default'])){
				//A defualt action process is set, call it.
				$func = $this->actions['default'];
				$func($this, $data, $action);
				//call_user_func($this->actions['default'], &$this, $data, $action);
			}else{
				//Dammit, nothing, send a log to the browser
				$this->call('log', "Unrecognized action: $action, no default function set.", true);
			}
			$this->reply();
		}
	}

	// Primary Data Return; echos out the JSON data;
	function reply($data = true){
		$data = $data === true ? $this->data : $data;

		//Load the relevant session changes data
		$session = &$_SESSION['StringQuery'][$this->key]['changes'];

		//Run through the changes and compare to the $_SESSION copy
		//to see if any of the changes are new compared to last request.
		foreach($data as $target => $change){
			if(	isset($session[$target]) &&
				json_encode($session[$target]) === json_encode($change) &&
				!in_array($target, $this->force)){
				//If the target is the same, AND there's no force change
				//enabled for that target, unset it, lightening $data
				unset($data[$target]);
			}else{
				$session[$target] = $change;
			}
		}

		//Check the system load and adjust the update interval accordingly
		$this->sysLoadTime();

		//Print out the JSON data
		echo json_encode(array(
			'i' => $data,
			'r' => $this->repeat,
			'u' => $this->update_interval + $this->min_update_interval,
			'k' => $this->key,
			't' => round(microtime(true) - $this->start, 4),
			'v' => $this->verbose
		));

		exit; //Adding anything after the JSON will break it.
	}

	// Update a target with multiple properties
	function update($target, $data, $force = null){
		if($force === null) //set $force to the default setting
			$force = $this->forced;

		if($force) //Add target to list of forced changes
			$this->force[] = $target;

		//Add it to the $data array
		if(isset($this->data[$target]) && is_array($this->data[$target])){
			//changes for this target exist, add/ovewrite properties
			$this->data[$target] = array_merge($this->data[$target], $data);
		}else{
			//create new $data entry for this target
			$this->data[$target] = $data;
		}
	}

	// Update a specific property
	function updateProp($target, $prop, $value, $force = null){
		if($force === null) //set $force to the default setting
			$force = $this->forced;

        if($force) //Add target to list of forced changes
            $this->force[] = $target;

		//Add it to the $data array
		if(isset($this->data[$target]) && is_array($this->data[$target])){
			//changes for this target exist, add/ovewrite property
			$this->data[$target][$prop] = $value;
		}else{
			//create new $data entry for this target
			$this->data[$target] = array(
				$prop => $value
			);
		}
	}

	// Call a StringQuery.parsers function
	function call($func, $data, $force = null){
		$func = "@$func";

		if($force === null) //set $force to the default setting
			$force = $this->forced;

        if($force) //Add target to list of forced changes
            $this->force[] = $func;

		//Add it to the $data array
		$this->data[$func] = $data;
	}

	// Update multiple targets in one go
	function bulkUpdate(array $targets, $force = null){
		if($force === null) //set $force to the default setting
			$force = $this->forced;

		if($force) //Add targets to list of forced changes
			foreach($targets as $target => $data){
				$this->force[] = $target;
			}

		//Add it to the $data array
		$this->data = array_merge_recursive($this->data, $targets);
	}

	// Helper Function: system load time
	function sysLoadTime(){
		if(@file_exists('/proc/loadavg')){
			$load = explode(' ', file_get_contents('/proc/loadavg'));
			$load = (float) $load[0];
		}elseif(function_exists('shell_exec')){
			$load = explode(' ', `uptime`);
			$load = (float) $load[0];
		}else{
			$load = 1;
		}

		if($load <= 1)
			$u = mt_rand(1000, 2000);
		elseif($load <= 1.5)
			$u = mt_rand(1000, 2000);
		elseif($load <= 2.5)
			$u = mt_rand(1500, 2500);
		elseif($load <= 3)
			$u = mt_rand(2000, 3000);
		elseif($load <= 3.25)
			$u = mt_rand(2500, 3500);
		elseif($load <= 3.45)
			$u = mt_rand(3500, 4500);
		elseif($load <= 3.55)
			$u = mt_rand(4500, 5500);
		elseif($load <= 3.65)
			$u = mt_rand(5500, 6500);
		elseif($load <= 3.75)
			$u = mt_rand(6500, 7500);
		elseif($load <= 3.85)
			$u = mt_rand(7500, 8500);
		elseif($load <= 3.95)
			$u = mt_rand(9000, 11000);
		else
			$u = mt_rand(19000, 21000);

		$this->update_interval = $u;
	}
}