//Marionette Javascript API
var Marionette = {
	//Script script
	script: '',

	//Session Key
	sessionKey: null,

	//The update interval
	updateInterval: 1000,

	//Default data to send
	defaultData: null,

	//Send Count
	sendCount: 0,

	//Logging Boolean
	logging: false,

	//Action Log
	actionLog: [],

	//Retry counter, limit and pace
	tries: 0,
	//maxTries: 10,
	retryPace: 2500,

	//Timeouts container
	timeouts: {},

	//Attribute and Function "Constants"
	attributes: ['href', 'class'],
	properties: ['checked', 'selected', 'nodeType'],
	functionsVoid: ['hide', 'show'],
	functionsSingle: ['addClass', 'after', 'append', 'appendTo', 'before', 'detach', 'empty', 'fadeIn', 'fadeOut', 'height', 'html', 'insertAfter', 'insertBefore', 'prepend', 'prependTo', 'remove', 'removeAttr', 'removeClass', 'removeData', 'removeProp', 'replaceWidth', 'scrollLeft', 'scrollTop', 'text', 'toggleClass', 'unwrap', 'val',  'width', 'wrap', 'wrapAll', 'wrapInner'],
	functionsMulti: ['animate', 'attr', 'fadeTo', 'prop'],

	//Utility functions
	in_array: function(n, h){
		for(var i in h){
			if(h[i] == n)
				return true;
		}
		return false;
	},
	array_remove: function(t, s){
		for(var i in s){
			if(t == s[i])
				s.splice(i, 1);
		}
		return s;
	},

	//Log functions
	logMax: 500,
	log: function(data, force){
		if(this.actionLog.length > this.logMax){
			this.actionLog.push('');
			this.actionLog = this.actionLog.slice(-1 * this.logMax,-1);
		}
		this.actionLog.push(data);

		if(force || (this.logging && console.log !== undefined)) console.log(data);
	},

	//Retry Function
	retry: function(action, data, skipLogging){
		for(var p in Marionette.timeouts){
			clearTimeout(Marionette.timeouts[p]);
		}

		Marionette.tries++;
		this.log('Error connecting, retry number '+Marionette.tries, true);
		Marionette.timeouts[action] = setTimeout(function(){
			Marionette.sendData(action, data, skipLogging);
		}, Marionette.retryPace * (Math.floor(Marionette.tries / 10) + 1));
	},

	//The send data function
	sendData: function(action, data, skipLogging){
		var m = this;
		var $ = jQuery;

		m.sendCount++;

		m.log('Send #'+this.sendCount);
		m.log('Session Key: '+this.sessionKey);

		var request;
		if(typeof data == 'undefined')
			request = {action: action, k: this.sessionKey};
		else
			request = {action: action, k: this.sessionKey, data: data === null ? m.defaultData : data};

		m.log('Sending the following data to '+m.script+':');
		m.log(request);

		var start = (new Date()).getTime(), end;

		$.ajax({
			url: m.script,
			data: {Marionette: request},
			dataType: 'json',
			type: 'POST',
			success: function(response){
				end = (new Date()).getTime();

				if(m.tries > 0){
					m.log('Connection reestablish after '+m.tries+' tries', true);
					m.tries = 0;
				}

				if(response !== null && response.l !== undefined)
					m.logging = response.l;

				if(!response || typeof response != 'object'){
					m.log('Data returned is not JSON',true);
					m.log(response, true);
					m.retry(action, data, skipLogging);
					return;
				}

				m.log('Data Returned:');
				m.log(response);

				if(response.k !== undefined){
					m.log('Setting session key: '+response.k);
					m.sessionKey = response.k;
				}

				if(response.c !== undefined){
					var c, t, e, p;
						c = response.c;
					m.log('Procession Changes');
					for(t in c){ // t = target
						m.log('Begin Processing '+t);

						if(t.match(/^\d+$/)){
							//Data is being sent to a predefined "mode" function
							m.log(t+' is numeric, calling custom parser function matching that ID with the following data: "'+c[t]+'"');
							if(typeof m.parsers[t] == 'function'){//Make sure the function exists
								m.parsers[t](c[t], t);
							}else{
								m.log('No function at parsers['+t+'] exists');
							}
						}else{
							m.log(t+' is a selector, running through attribute settings');
							e = $(t);
							if(e.length > 0){
								for(p in c[t]){ // p = property
									m.log('Editing "'+p+'" for "'+t+'" with the folowing data: "'+c[t][p]+'"');
									m.process(p, c[t][p], e);
								}
							}else{
								m.log('No elements matching "'+t+'" were found.');
							}
						}
					}
				}

				if(response.u !== undefined && response.r === true){
					m.log('Interval set and repeat is true, setting timeout to repeat "'+action+'" action to "'+m.script+'"');

					m.timeouts[action] = setTimeout(function(){
						m.sendData(action, data, skipLogging);
					}, response.u);
				}else if(action == 'ping'){
					//Reping the server anyway in 1 minute, just in case
					m.timeouts[action] = setTimeout(function(){
						m.sendData(action, data, skipLogging);
					}, 60000);
				}

				m.log('Client Execution Time: '+(end-start)+'ms');
				m.log('Server Execution Time: '+response.t+'ms');
			},
			error: function(jqXHR, textStatus, errorThrown){
				end = (new Date()).getTime();
				m.log(jqXHR, true);
				m.retry(action, data, skipLogging);
			}
		});
	},

	init: function(script, data){
		if(script !== undefined) this.script = script;
		this.sendData('ping', data);
	},

	process: function(p, v, e){
		var f, m = this;
		if(p.match(/data-/) || m.in_array(p, m.attributes)){
			//Updating a registered attritube
			m.log(p+' is a registered attribute, editing via $.fn.attr');
			e.attr(p, v);
		}else if(m.in_array(p, m.properties)){
			//Updating a registered property
			m.log(p+' is a registered property, editing via $.fn.prop');
			e.prop(p, v);
		}else if(m.in_array(p, m.functionsVoid)){
			//Updating a registered jQuery function
			m.log(p+' is a registered void function, calling function directly');
			e[p]();
		}else if(m.in_array(p, m.functionsSingle)){
			//Updating a registered jQuery function
			m.log(p+' is a registered single argument function, calling function directly');
			e[p](v);
		}else if(m.in_array(p, m.functionsMulti)){
			//Updating a registered multi argument jQuery function
			//(value is assumed to be array of arguments)
			m.log(p+' is a registered multi argument function, calling function through apply');
			$.fn[p].apply(e, v);
		}else{
			f = m.parsers[p];
			if(typeof f == 'function'){
				m.log(p+' is a custom parser function, calling directly');
				m.parsers[p](p, v, e, m);
			}else if(typeof m.parsers[f] == 'function'){
				m.log(p+' is an alias to the custom parser function '+f+', calling directly');
				m.parsers[f](p, v, e, m);
			}else{
				m.log(p+' is assumed to be a DOM property, editing directly');
				e.get(0)[p] = v;
			}
		}
	},

	//Parsers
	parsers: {
		0: function(data){
			Marionette.log('Data returned, logging data.');
			Marionette.log(data,true);
		},
		1: function(data){
			if(typeof data == 'object'){
				/*
				Data is (presumably) an array of multiple
				messages to log, so go through each one and
				log them.
				*/
				Marionette.log('Data returned is an object, assuming it\'s an array of messages to alert with.');
				for(var m in data){
					alert(data[m]);
				}
			}else{//data is just a string (single message), log it.
				Marionette.log('Data returned is a string, alerting with data.');
				alert(data);
			}
		},
		css: function(p, v, e){
			for(var k in v){
				$(e).css(k, v[k]);
			}
		},
		data: function(p, v, e){
			for(var k in v){
				$(e).data(k, v[k]);
			}
		},
		traverse: function(p, v, e, m){
			var s;
			if(v.length == 2){
				s = v[0];
				v = v[1];
			}else{
				s = null;
			}
			for(var k in v){
				m.process(k, v[k], $(e)[p](s));
			}
		},
		children: 'traverse',
		eq: 'traverse',
		fitler: 'traverse',
		find: 'traverse',
		has: 'traverse',
		is: 'traverse',
		next: 'traverse',
		nextAll: 'traverse',
		nextUntil: 'traverse',
		not: 'traverse',
		parent: 'traverse',
		parents: 'traverse',
		parentsUntil: 'traverse',
		prev: 'traverse',
		prevAll: 'traverse',
		prevUntil: 'traverse',
		siblings: 'traverse'
	}
};

//Setup Marionette form functionality
if(typeof jQuery == 'function')
jQuery(document).ready(function(){
	$('body').on('submit', 'form.marionette', function(e){
		e.preventDefault();
		var action = $(this).data('action');
		var data = $(this).serialize();
		Marionette.sendData(action, data);
	});
});