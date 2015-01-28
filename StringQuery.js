/*
Built with StringQuery (https:// github.com/dougwollison/StringQuery/)

Version 1.1.4; Released 29/05/2013

Copyright © 2012 Richard Cornwell & Doug Wollison
For conditions of distribution and use, see copyright notice in LICENSE
*/

// StringQuery Javascript API
var StringQuery = {
	// Script script
	script: '',

	// Session Key
	sessionKey: null,

	// The update interval
	updateInterval: 1000,

	// Default data to send
	defaultData: {},

	// Send Count
	sendCount: 0,

	// Logging Boolean
	logging: false,

	// Action Log
	actionLog: [],

	// Retry counter, limit and pace
	tries: 0,
	// maxTries: 10,
	retryPace: 2500,

	// Timeouts container
	timeouts: {},

	// Attribute and Function "Constants"
	attributes: [ 'href', 'class' ],
	properties: [ 'checked', 'selected', 'nodeType' ],
	functions: {
		noArg: [ 'hide', 'show' ],
		oneArg: [ 'addClass', 'after', 'append', 'appendTo', 'before', 'detach', 'empty', 'fadeIn', 'fadeOut', 'height', 'html', 'insertAfter', 'insertBefore', 'prepend', 'prependTo', 'remove', 'removeAttr', 'removeClass', 'removeData', 'removeProp', 'replaceWidth', 'scrollLeft', 'scrollTop', 'text', 'toggleClass', 'unwrap', 'val',  'width', 'wrap', 'wrapAll', 'wrapInner' ],
		multiArg: [ 'animate', 'attr', 'fadeTo', 'prop' ]
	},

	// Utility functions
	in_array: function( n, h ) {
		for ( var i in h ) {
			if ( h[ i ] == n ) {
				return true;
			}
		}
		return false;
	},
	array_remove: function( t, s ) {
		for ( var i in s ) {
			if ( t == s[ i ] ){
				s.splice( i, 1 );
			}
		}
		return s;
	},

	// Log functions
	logMax: 500,
	log: function( data, force ) {
		if ( this.actionLog.length > this.logMax ) {
			this.actionLog.push( '' );
			this.actionLog = this.actionLog.slice( -1 * this.logMax, -1 );
		}
		this.actionLog.push( data );

		if ( force || ( this.logging && console.log !== undefined ) ){
			console.log( data );
		}
	},

	// Retry Function
	retry: function( action, data ) {
		for ( var p in StringQuery.timeouts ) {
			clearTimeout( StringQuery.timeouts[ p ] );
		}

		StringQuery.tries++;
		this.log( 'Error connecting, retry number '+StringQuery.tries, true );
		StringQuery.timeouts[ action ] = setTimeout(function(){
			StringQuery.sendData(action, data );
		}, StringQuery.retryPace * ( Math.floor( StringQuery.tries / 10 ) + 1 ) );
	},

	// The send data function
	sendData: function( action, data, script ) {
		var q = this;

		q.sendCount++;

		q.log( 'Send #'+this.sendCount );
		q.log( 'Session Key: '+this.sessionKey );

		var request;
		if(typeof data == 'undefined')
			request = { action: action, k: this.sessionKey };
		else
			request = { action: action, k: this.sessionKey, data: typeof q.defaultData[ action ] != 'undefined' ? q.defaultData[ action ] : data };
			
		if ( typeof script == 'undefined' ) {
			script = q.script;
		}

		q.log( 'Sending the following data to ' + q.script + ':' );
		q.log( request );

		var start = ( new Date() ).getTime(), end;

		jQuery.ajax({
			url: script,
			data: { StringQuery: request },
			dataType: 'json',
			type: 'POST',
			success: function( response ) {
				end = ( new Date() ).getTime();

				if ( q.tries > 0 ) {
					q.log( 'Connection reestablished after ' + q.tries + ' tries', true );
					q.tries = 0;
				}

				if ( ! response || typeof response != 'object' ) {
					q.log( 'Data returned is not JSON', true );
					q.log( response, true );
					q.retry( action, data );
					return;
				}

				if ( response !== null && response.v !== undefined ) {
					q.logging = response.v;
				}

				q.log( 'Data Returned:' );
				q.log( response );

				if ( response.k !== undefined ) {
					q.log( 'Setting session key: ' + response.k );
					q.sessionKey = response.k;
				}

				// Process instructions if present
				if ( response.i !== undefined && typeof response.i == 'object' ) {
					var i, t, e, p;
						i = response.i;
					q.log( 'Procession Changes' );
					for ( t in i ) { // t = target
						q.log( 'Begin Processing ' + t );

						if ( t.charAt(0) == '@' ) {
							// Data is being sent to a predefined "mode" function
							q.log( t + ' is or @ prefixed, calling special method function matching that ID/name with the following data: "' + i [ t ] + '"' );
							var n = t.replace('@','');
							if ( typeof q.methods[ n ] == 'function' ) { // Make sure the function exists
								q.methods[ n ]( i[ t ], t );
							} else {
								q.log( 'No function at methods[' + n + '] exists' );
							}
						} else {
							q.log( t + ' is a selector, running through attribute settings' );
							e = jQuery( t );
							if ( e.length > 0 ) {
								for ( p in i[ t ] ) { // p = property
									q.log( 'Editing "' + p + '" for "' + t + '" with the folowing data: "' + i[ t ][ p ] + '"' );
									q.process( p, i[ t ][ p ], e );
								}
							} else {
								q.log( 'No elements matching "' + t + '" were found.' );
							}
						}
					}
				}

				// Repeat action if needed and if an interval is present
				if ( response.u !== undefined && response.r === true ) {
					q.log( 'Interval set and repeat is true, setting timeout to repeat "' + action + '" action to "' + q.script + '"' );

					q.timeouts[ action ] = setTimeout(function() {
						q.sendData( action, data, script );
					}, response.u );
				} else if ( action == 'ping' ) {
					// Reping the server anyway in 1 minute, just in case
					q.timeouts[ action ] = setTimeout( function() {
						q.sendData( action, data, script );
					}, 60000 );
				}

				q.log( 'Client Execution Time: ' + ( end - start ) + 'ms' );
				q.log( 'Server Execution Time: ' + response.t + 'ms' );
			},
			error: function( jqXHR, textStatus, errorThrown ) {
				q.log( jqXHR, true );
				q.retry( action, data, script );
			}
		});
	},

	// Set the script address and start pinging
	init: function( script, data ) {
		if ( script !== undefined ) this.script = script;
		this.sendData( 'ping', data );
	},

	// Process the property/value for the element
	process: function( p, v, e ) {
		var f, q = this;
		if ( p.match( /data-/ ) || q.in_array( p, q.attributes ) ) {
			// Updating a registered attritube
			q.log( p + ' is a registered attribute, editing via jQuery.fn.attr' );
			e.attr( p, v );
		} else if ( q.in_array( p, q.properties ) ) {
			// Updating a registered property
			q.log( p + ' is a registered property, editing via jQuery.fn.prop' );
			e.prop( p, v );
		} else if ( q.in_array( p, q.functions.noArg ) ) {
			// Updating a registered jQuery function
			q.log( p + ' is a registered void function, calling function directly' );
			e[ p ]();
		} else if ( q.in_array( p, q.functions.oneArg ) ) {
			// Updating a registered jQuery function
			q.log( p + ' is a registered single argument function, calling function directly' );
			e[ p ]( v );
		} else if ( q.in_array( p, q.functions.multiArg ) ) {
			// Updating a registered multi argument jQuery function
			// (value is assumed to be array of arguments)
			q.log( p + ' is a registered multi argument function, calling function through apply' );
			jQuery.fn[ p ].apply( e, v );
		} else {
			f = q.utilities[ p ];
			if ( typeof f == 'function' ) {
				q.log ( p + ' is a custom utility function, calling directly' );
				q.utilities[ p ]( p, v, e, q );
			} else if ( typeof q.utilities[ f ] == 'function' ) {
				q.log( p + ' is an alias to the custom utility function ' + f + ', calling directly' );
				q.utilities[ f ]( p, v, e, q );
			} else {
				q.log( p + ' is assumed to be a DOM property, editing directly' );
				e.each(function() {
					this[ p ] = v;
				});
			}
		}
	},

	// Special Methods
	methods: {
		log: function( data ) {
			StringQuery.log( 'Data returned, logging data.' );
			StringQuery.log( data, true );
		},
		alert: function( data ) {
			if ( typeof data == 'object' ) {
				/*
				Data is (presumably) an array of multiple
				messages to log, so go through each one and
				log them.
				*/
				StringQuery.log( 'Data returned is an object, assuming it\'s an array of messages to alert with.' );
				for ( var q in data ) {
					alert( data[ q ] );
				}
			} else { // data is just a string (single message), log it.
				StringQuery.log( 'Data returned is a string, alerting with data.' );
				alert( data );
			}
		}
	},

	// Utility Functions
	utilities: {
		css: function( p, v, e ) {
			for ( var k in v ) {
				jQuery( e ).css( k, v[ k ] );
			}
		},
		data: function( p, v, e ) {
			for ( var k in v ) {
				jQuery( e ).data( k, v[ k ] );
			}
		},
		traverse: function( p, v, e, q ) {
			var s;
			if ( v.length == 2 ) {
				s = v[0];
				v = v[1];
			} else {
				s = null;
			}
			for ( var k in v ) {
				q.process( k, v[ k ], jQuery( e )[ p ]( s ) );
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

// Setup StringQuery form/button/link functionality
jQuery( document ).ready( function() {
	jQuery( 'body' )
	// Form submit functionality
	// Ex: <form data-action="action" class="stringquery">
	// Ex: <form class="stringquery">
	//		<input type="hidden" name="stringquery">
	.on( 'submit', 'form.stringquery', function( e ) {
		e.preventDefault(); // stop form from submitting normally
		
		var action, data;
		
		var input = $( 'input[name="stringquery"]', this );
		
		// Get the action name from either the input element or data attribute
		if ( input.length > 0 ) {
			action = input.val();
		} else {
			// no input element, assume data attribute
			action = $( this ).data( 'action' );
		}
		
		data = $( this ).serialize();
		
		// Make sure there's an action, then run sendData()
		if ( action != '' ) {
			// Pass data as an entry in an object with __serialized = data,
			// so it knows to run the data through parse_str on the server.
			StringQuery.sendData( action, { __serialized: data } );
		}
	})
	// Button click functionality
	// Ex: <button name="action" value="data" class="stringquery">
	.on( 'click', 'button.stringquery', function( e ) {
		e.preventDefault(); // stop button from triggering anything normally
		
		var action = $( this ).attr( 'name' );
		var data = $( this ).val();
		
		// Make sure there's an action, then run sendData()
		if ( action != '' ) {
			StringQuery.sendData( action, data );
		}
	})
	// Link click functionality
	// Ex: <a href="#action" target="data" class="stringquery">
	.on( 'click', 'a.stringquery', function( e ) {
		e.preventDefault(); // stop anchor from proceeding normally
		
		var action = $( this ).attr( 'href' ).replace( '#','' );
		var data = $( this ).attr( 'target' );
		
		// Make sure there's an action, then run sendData()
		if ( action != '' ) {
			StringQuery.sendData( action, data );
		}
	});
});
