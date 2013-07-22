var express = require('express');
var app = express();
var https = require('https');
var fs = require('fs');
var http = require('http');
var sys = require('sys')
var exec = require('child_process').exec;
var request = require('request');
var mysql      = require('mysql');
var offlineTransaction = require('./converted/offlineTransaction');

var Db = require('mysql-activerecord');
var db = new Db.Adapter({
    server: 'localhost',
    username: 'root',
    password: '',
    database: 'bitcoinbackend'
});

/* begin strongcoin import */
var strongcoin_offline_transaction = [
    'lib/events/eventemitter.js',
    'lib/jsbn/ec.js',
    'lib/jsbn/prng4.js',
    'lib/jsbn/rng.js',
    'lib/jsbn/sec.js',
    'lib/jsbn/jsbn.js',
    'lib/jsbn/jsbn2.js',
    'lib/crypto-js/crypto.js',
    'lib/crypto-js/ripemd160.js',
    'lib/crypto-js/sha256.js',
    'lib/bitcoin.js',
    'lib/ecdsa.js',
    'lib/eckey.js',
    'lib/opcode.js',
    'lib/paillier.js',
    'lib/script.js',
    'lib/transaction.js',
    'lib/txdb.js',
    'lib/util.js',
    'lib/wallet.js',
    'lib/address.js',
    'lib/base58.js',
];
var strongcoin_concat = '(function(exports){';
for(var i in strongcoin_offline_transaction){
    path = strongcoin_offline_transaction[i];
    console.log(path);
    strongcoin_concat += "\n"+'/* START FILE '+path+' */';
    strongcoin_concat += (fs.readFileSync(__dirname+'/strongcoinOfflineTransaction/'+path)+''+"\n");
    strongcoin_concat += "\n"+'/* END FILE '+path+' */';
}
strongcoin_concat += "})(typeof exports === 'undefined'? this['strongcoin']={}: exports);"

fs.writeFile("../strongcoin.js", strongcoin_concat, function(err){
    if(err)
	console.log(err);
});
eval(strongcoin_concat);
//var strongcoin = require('../strongcoin');



/* end strongcoin import */



var data = {public_key: 'testtest'};
db.insert('account', data, function(err, info){

});

var help = {};



app.all('*', function(req, res, next){
    req.request = {};
    var to_merge = ['query', 'body'];
    for(var i in to_merge){
	var el = to_merge[i];
	if(typeof(req[el])!='undefined'){
	    var set = req[el];
	    for(var i in set){
		req.request[i] = set[i];
	    }
	}
    }
    next();
});


app.all('/', function(req, res){
    var data = help;
    output(data, res);
});

var call = '';


///////////
//Begin basic (atomic stuff)
/////////

help['/createAddress'] = {'description':'Creates a new private key and public address and returns it. Nothing is stored on the server.'};
app.all('/createAddress', function(req, res){
    addressCreator(function(addr){
	output(addr, res);
    });
});  

//

call = '/getReceivedByAddress';
help[call+'?address=198ih67Pg8LcHS5oshc34uraN34k3dXdCp'] = {'decription':'Get the total bitcoins recieved by an address'};
app.all(call, function(req, res){
    var apiUrl = 'http://blockexplorer.com/q/getreceivedbyaddress/'+req.request.address;
    outputAPIValueAsJson(apiUrl, res);
});


//

call = '/getBalance';
help[call+'?address=198ih67Pg8LcHS5oshc34uraN34k3dXdCp'] = {'decription':'Get the bitcoin balance by an address',
				};
app.all(call, function(req, res){
    var apiUrl = 'http://blockexplorer.com/q/addressbalance/'+req.request.address;
    outputAPIValueAsJson(apiUrl, res);
});

//

var call='/getTransactions'
help[call+'?addresses=198ih67Pg8LcHS5oshc34uraN34k3dXdCp.54321.121212'] = {'description':'Get the transactions of one or more (dot seperated) addresses',
			   };
app.all(call, function(req, res){
    outputAPI('http://blockexplorer.com/q/mytransactions/'+req.request.addresses, req, res);
});

//
var call = '/sendTransaction';
help[call+'?transaction=gobblegobbledegook'] = {'description':'Send a raw transaction to the bitcoin network', 'status':'not functional'};
app.all('/sendTransaction', function(req, res){
    addressCreator(function(addr){
	output(addr, res);
    });
});


var call = '/createUnsignedTransaction';
help[call+'?private_key=xyzxyz'] = {'description':'Send a raw transaction to the bitcoin network', 'status':'not functional'};
// test private key 5JJwCBtncdpK1UzrPFZi36YftWBrgAsVW9YPefGZZGW3nif9eg6
app.all(call, function(req, res){
    createUnsignedTransaction(req.request,
					function(result){
					    output(result, res);
					}
				       );
});

function createUnsignedTransaction(params, callback){
    var out = {};
    key = offlineTransaction.priv2key(params.private_key);
    ownAddress = key.getBitcoinAddress();
    out.addr = ownAddress.toString();
    out.url = 'http://blockexplorer.com/q/mytransactions/'+out.addr;
    getAPI(
	'http://blockexplorer.com/q/mytransactions/'+out.addr, 
	function(transactions){
	    //out.transactions = transactions;

	    var result = parseTxs(transactions,ownAddress); // {balance:<balance>, unspenttxs:{ "<hash>": { <output index>: { amount:<amount>, script:<script> }}}}
	    out.balance = bignum2btcstr(result.balance);
	    return callback(out);

	    callback(out);
	}
    );

}


////////////
// Compound functions (uses multiple atomic functions and other tools)
///////////

var call='/setAddressCallback'
help[call+'?address=198ih67Pg8LcHS5oshc34uraN34k3dXdCp&callback=http://someurl.com'] = {'description':'Get the transactions of one or more (dot seperated) addresses'}
app.all(call, function(req, res){
    setAddressCallback(req.request.address, req.request.callback);
    output({success:true}, res);
});

function setAddressCall(address, callback){
   var data = {
	public_address:address,
	url:callback
    }
    db.insert('address_callback', data, function(err, info){});
}


help['/doesTransactionExist'] = {'description':'Bla fucking bla', 'status':'not functional'};
app.all('/doesTransactionExist', function(req, res){

});


help['/getNewAccountAddress?account=jjkjsdf&nonce=12313&signature=slfjsljdf&callback=http://somewebsite.com'] = {'desc':'Create and get a new address for account'};
app.all('/getNewAccountAddress', function(req, res){
    addressCreator(function(addr){
	addr.account_id = 1;
	db.insert('account_address', addr, function(err, info){});
	//TODO: Save address to account
	output({public_address:addr.public_address}, res);
    });
});

help['/send/?from=addr1&to=addr2&amount=12.23|ALL&public_key=jjkjsdf&nonce=12313&signature=slfjsljdf'] = {'desc':'Send amount from addr1 to addr2 and send change back to addr1', 'status':'not functional'};
app.all('/send', function(req, res){
    var data = {transaction_id:'jjjjjjj'};
    output(data, res);
});

/////////////
///Functions

function addressCreator(callback){
    var address = {};
    exec('./botg.sh', function(error, stdout, stderr){
	var out = stdout.split('\n');
	address.private_key = out[2];
	address.public_address = out[4];
	return callback(address);
    });
}



var output = function(data, res){
    data.credits = 99423;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write(JSON.stringify(data, null, '  '));
    res.end();
}

function outputAPIValueAsJson(apiUrl, res){
    getAPIBody(
	apiUrl,
	function(output){
	    res.send(JSON.stringify({value:output})+"\n");
	});
}

function getAPIBody(url, callback){
    request(url, function (error, response, body) {
	callback(body);
    });
}

function getAPI(url, callback){
    getAPIBody(url, function(body){
	callback(JSON.parse(body));
    });
}

function outputAPI(url, req, res){
    request(url, function (error, response, body) {
	if (!error && response.statusCode == 200) {
	    res.writeHead(200, { 'Content-Type': 'application/json' });
	    res.write(body);
	    res.end();
	}else{
	    res.send({'error':'Bad request'});
	}
    });
}
/*
var options = {
    key: fs.readFileSync('privatekey.pem'),
    cert: fs.readFileSync('certificate.pem')
};
https.createServer(options, app).listen(443);
*/
http.createServer(app).listen(80);
http.createServer(app).listen(3000);
