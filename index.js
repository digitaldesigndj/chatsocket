// 'use strict';

//
// Require all dependencies.
//
// Argh is an light weight argument parser that we use in this example to change
// between parsers and transformers. The following CLI arguments are accepted:
//
// --transformer <value>  (the name of the transformer we want to use)
// --parser <value>       (the name of the parser we want to use)
// --port <value>         (the port number we want to listen to)
//
var argh = require('argh').argv
	, Primus
	, server
	, primus;

//
// Default to the repository, but when we're deployed on a server use the latest
// Primus instance.
//
try { Primus = require('../../'); }
catch (e) { Primus = require('primus'); }

//
// Some build in Node.js modules that we need:
//
var http = require('http')
	, fs = require('fs')
	, Tail = require('tail').Tail
	, _ = require('underscore');

//
// Create a basic server that will send the compiled library or a basic HTML
// file which we can use for testing.
//
server = http.createServer(function server(req, res) {
	res.setHeader('Content-Type', 'text/html');
	fs.createReadStream(__dirname + '/index.html').pipe(res);
});

//
// Now that we've setup our basic server, we can setup our Primus server.
//
primus = new Primus(server, { transformer: argh.transformer, parser: argh.parser });

tail = new Tail("/root/Starbound/linux64/starrybound/log.txt");

var last5chats = [];
var players_online = [];


tail.on("line", function(data) {
	if( data.indexOf('] joined with UUID') !== -1 ) {
		user_on = data.split('] [')[1].split("][")[0];
		// console.log( user_on );
		if( !_.contains( players_online, user_on ) ) {
			players_online.push( user_on );
		}
	}

	if( data.indexOf('] has left the server.') !== -1 ) {
		user_off = data.split('] [')[1].split("] has")[0];
		players_online = _.filter( players_online, function( name ) {
			return name !== user_off;
		});
	}

	if( data.indexOf('] Dropped by') !== -1 ) {
		user_off = data.split('] [')[1].split("] Dropped")[0];
		players_online = _.filter( players_online, function( name ) {
			return name !== user_off;
		});
	}

	if( data.indexOf('[INFO] [Universe] ') !== -1 ) {
		last5chats.push( data.replace( '[INFO] [Universe] ', '' ) );
		if( last5chats.length === 6 ) {
			last5chats.shift();
		}
	}
});

//
// Listen for new connections and send data
//
primus.on('connection', function connection(spark) {
	console.log('new connection');

	var message = {};
	message.type = 'player_list';
	message.list = players_online;
	spark.write( JSON.stringify( message ) );

	_.each( last5chats, function( v, i ){
		var message = {};
		message.type = 'chat';
		message.message = _.escape( v );
		spark.write( JSON.stringify( message ) );
	});

	tail.on("line", function(data) {
		if( data.indexOf('[INFO] [Universe] ') !== -1 ) {
			var message = {};
			message.type = 'chat';
			message.message = _.escape( data.replace( '[INFO] [Universe] ', '' ) );
			spark.write( JSON.stringify( message ) );
		}
		if( data.indexOf('] joined with UUID') !== -1 || data.indexOf('] has left the server.') !== -1 || data.indexOf('] Dropped by') !== -1 ) {
			var message = {};
			message.type = 'player_list';
			message.list = players_online;
			spark.write( JSON.stringify( message ) );
		}
	});
});

//
// Save the compiled file to the hard disk so it can also be distributed over
// cdn's or just be served by something else than the build-in path.
//
primus.save('primus.js');

//
// Everything is ready, listen to a port number to start the server.
//
server.listen(+argh.port || 8080);
