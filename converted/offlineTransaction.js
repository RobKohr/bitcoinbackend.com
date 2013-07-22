var Bitcoin = require('./bitcoin');

    exports.isEmpty = function(ob) {
	for(var i in ob){ if(ob.hasOwnProperty(i)){return false;}}
	return true;
    }

    exports.bignum2btcstr = function(satoshi) {
	var s = String(satoshi);
	if (satoshi >= 100000000) {
	    var i = s.length - 8;
	    return s.substr(0, i) + "." + s.substr(i);
	} else {
	    var i = 8 - s.length;
	    return "0." + Array(i + 1).join("0") + s;
	}
    }

    exports.btcstr2bignum = function(btc) {
	var i = btc.indexOf('.');
	var value = new BigInteger(btc.replace(/\./,''));
	var diff = 9 - (btc.length - i);
	if (i == -1) {
	    var mul = "100000000";
	} else if (diff < 0) {
	    return value.divide(new BigInteger(Math.pow(10,-1*diff).toString()));
	} else {
	    var mul = Math.pow(10,diff).toString();
	}
	return value.multiply(new BigInteger(mul));
    }

    // Adapted from bitcoin-js base58.js Bitcoin.Base58.decode
    exports.priv2key = function(privBase58) {
	var bytes = Bitcoin.Base58.decode(privBase58);

	var hash = bytes.slice(0, 33);

	var checksum = Crypto.SHA256(Crypto.SHA256(hash, {asBytes: true}), {asBytes: true});
	if (checksum[0] != bytes[33] ||
	    checksum[1] != bytes[34] ||
	    checksum[2] != bytes[35] ||
	    checksum[3] != bytes[36]) {
	    throw "Checksum validation failed!";
	}
	var version = hash.shift();

	if (version != 0x80) {
	    throw "Version "+version+" not supported!";
	}

	var key = new Bitcoin.ECKey(hash);
	return key;
    }

    exports.parseScript = function(script) {
	var newScript = new Bitcoin.Script();
	var s = script.split(" ");
	for (var i in s) {
	    if (Bitcoin.Opcode.map.hasOwnProperty(s[i])){
		newScript.writeOp(Bitcoin.Opcode.map[s[i]]);
	    } else {
		newScript.writeBytes(Crypto.util.hexToBytes(s[i]));
	    }
	}
	return newScript;
    }

    // Adapted from bitcoin-js wallet.js Wallet.exports.createSend
    exports.createSend = function(address, changeAddress, sendValue, feeValue) {
	var selectedOuts = [];
	var txValue = sendValue.add(feeValue);
	var availableValue = BigInteger.ZERO;
	
	for (var hash in unspenttxs) {
	    if (!unspenttxs.hasOwnProperty(hash))
		continue;
	    for (var index in unspenttxs[hash]) {
		if (!unspenttxs[hash].hasOwnProperty(index))
		    continue;
		var script = exports.parseScript(unspenttxs[hash][index].script);
		var b64hash = Crypto.util.bytesToBase64(Crypto.util.hexToBytes(hash));
		selectedOuts.push(new Bitcoin.TransactionIn({outpoint: {hash: b64hash, index: index}, script: script, sequence: 4294967295}));
		availableValue = availableValue.add(unspenttxs[hash][index].amount);
		if (availableValue.compareTo(txValue) >= 0) break;
	    }
	}

	if (availableValue.compareTo(txValue) < 0) {
	    throw new Error('Insufficient funds.');
	}


	var changeValue = availableValue.subtract(txValue);

	var sendTx = new Bitcoin.Transaction();

	for (var i = 0; i < selectedOuts.length; i++) {
	    sendTx.addInput(selectedOuts[i]);
	}
	sendTx.addOutput(address, sendValue);
	if (changeValue.compareTo(BigInteger.ZERO) > 0) {
	    sendTx.addOutput(changeAddress, changeValue);
	}
	
	var hashType = 1; // SIGHASH_ALL
	
	for (var i = 0; i < sendTx.ins.length; i++) {
	    var hash = sendTx.hashTransactionForSignature(selectedOuts[i].script, i, hashType);
	    var pubKeyHash = selectedOuts[i].script.simpleOutPubKeyHash();
	    var signature = key.sign(hash);

	    // Append hash type
	    signature.push(parseInt(hashType));

	    sendTx.ins[i].script = Bitcoin.Script.createInputScript(signature, key.getPub());
	}

	console.log(sendTx);
	
	return sendTx;
    };
    
    
    exports.endian = function(string) {
	var out = []
	for(var i = string.length; i > 0; i-=2) {
	    out.push(string.substring(i-2,i));
	}
	console.debug(string);
	console.debug(out.join(""));
	return out.join("");
    }

    
    exports.parseFormData = function(form) {
	key = exports.priv2key(form.privkey.value);
	ownAddress = key.getBitcoinAddress();
	document.getElementById("Address").innerHTML = ownAddress.toString();
	var result = exports.parseTxs(form.transactions.value,ownAddress); // {balance:<balance>, unspenttxs:{ "<hash>": { <output index>: { amount:<amount>, script:<script> }}}}
	var balance = exports.bignum2btcstr(result.balance);
	unspenttxs = result.unspenttxs;
	document.getElementById("Balance").innerHTML = balance + " BTC";
	document.transactionForm.amount.value = balance;
    }

    exports.createTransaction = function(form) {
	var tx = exports.createSend(new Bitcoin.Address(form.target.value), ownAddress, exports.btcstr2bignum(form.amount.value), exports.btcstr2bignum(form.fee.value));
	var s = tx.serialize();
	console.debug(s);
	document.resultForm.Transaction.value = Crypto.util.bytesToHex(s);
    }

    exports.parseTxs = function(data, address) {
	/* JSON structure:
	   root
	   transaction hash
	   hash (same as above)
	   version
	   number of inputs
	   number of outputs
	   lock time
	   size (bytes)
	   inputs
	   previous output
	   hash of previous transaction
	   index of previous output
	   scriptsig (replaced by "coinbase" on generation inputs)
	   sequence (only when the sequence is non-default)
	   address (on address transactions only!)
	   outputs
	   value
	   scriptpubkey
	   address (on address transactions only!)
	   block hash
	   block number
	   block time
	*/
	var address = address.toString();
	var tmp = JSON.parse(data);
	var txs = [];
	for (var a in tmp) {
	    if (!tmp.hasOwnProperty(a))
		continue;
	    txs.push(tmp[a]);
	}
	
	// Sort chronologically
	txs.sort(function(a,b) {
	    if (a.time > b.time) return 1;
	    else if (a.time < b.time) return -1;
	    return 0;
	})

	delete unspenttxs;
	var unspenttxs = {}; // { "<hash>": { <output index>: { amount:<amount>, script:<script> }}}

	var balance = BigInteger.ZERO;

	// Enumerate the transactions 
	for (var a in txs) {
	    
	    if (!txs.hasOwnProperty(a))
		continue;
	    var tx = txs[a];
	    if (tx.ver != 1) throw "Unknown version found. Expected version 1, found version "+tx.ver;
	    
	    // Enumerate inputs
	    for (var b in tx.in ) {
		if (!tx.in.hasOwnProperty(b))
		    continue;
		var input = tx.in[b];
		var p = input.prev_out;
		var lilendHash = exports.endian(p.hash)
		// if this came from a transaction to our address...
		if (lilendHash in unspenttxs) {
		    unspenttx = unspenttxs[lilendHash];
		    
		    // remove from unspent transactions, and deduce the amount from the balance
		    balance = balance.subtract(unspenttx[p.n].amount);
		    delete unspenttx[p.n]
		    if (exports.isEmpty(unspenttx)) {
			delete unspenttxs[lilendHash]
		    }
		}
	    }
	    
	    // Enumerate outputs
	    var i = 0;
	    for (var b in tx.out) {
		if (!tx.out.hasOwnProperty(b))
		    continue;
		
		var output = tx.out[b];
		
		// if this was sent to our address...
		if (output.address == address) {
		    // remember the transaction, index, amount, and script, and add the amount to the wallet balance
		    var value = exports.btcstr2bignum(output.value);
		    var lilendHash = exports.endian(tx.hash)
		    if (!(lilendHash in unspenttxs))
			unspenttxs[lilendHash] = {};
		    unspenttxs[lilendHash][i] = {amount: value, script: output.scriptPubKey};
		    balance = balance.add(value);
		}
		i = i + 1;
	    }
	}
	return {balance:balance, unspenttxs:unspenttxs};
    }

    for(var i in this){
	exports.i = this.i;
    }
