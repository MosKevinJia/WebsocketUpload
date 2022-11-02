'use strict';
const WebSocket = require('ws');
const uuid = require('uuid');
const jetpack = require('fs-jetpack');  
var path = require("path"); 
 
var client_ids = 0;  
var uploadprocs = {};
var wss = null;
var upload_path = "../public/cache"; 
var need_auth = false;
var auth_codes = {};

// msgid(4位), string_byte[......]

// msgid(4位), hash_length(4位), hash_str(...), filebyte[......]


const msg_auth = 5;
const msg_uploadstart = 10;
const msg_uploadproc = 20;
const msg_uploadcomplete = 30;


function sendmsg(client, msgid, msg) { 
	var _msgid = Buffer.from(WUtil.IntToBytes(msgid));
	var _msg = Buffer.from(WUtil.stringToByte(msg));
	var buf = Buffer.concat([_msgid, _msg]); 
	client.send(WUtil.toArrayBuffer(buf)); 
}


// 添加上传队列
function addUploadQueue(client, file_info) {

	var hash = file_info.name + '_' + file_info.size + '_' + file_info.date;
	if (!uploadprocs[hash]) {

		var cachefilename = uuid.v4();   // 缓存文件名
		var filepath = path.join(__dirname, upload_path) ; // 路径
		uploadprocs[hash] = {
			name: file_info.name,
			size: file_info.size,
			type: file_info.type,
			date: file_info.date,
			client: client,
			cache_size: 0,  
			cache_name: cachefilename,
			cache_path: filepath,
		}

		jetpack.dir(`${filepath}`);
		jetpack.file(`${filepath}/${cachefilename}`, { mode: "666" }); 

	}  

	return {
		id: hash,
		cache_size: uploadprocs[hash].cache_size
	}
 

}


function appendUploadBuff(hash, data) {
	if (uploadprocs[hash]) {

		var c = uploadprocs[hash];
		
		c.cache_size += data.length;
		var fullpath = `${c.cache_path}/${c.cache_name}`;
		jetpack.append(fullpath, data);

		if (c.cache_size >= c.size) {
			// 完成
			jetpack.rename(fullpath, c.name, { overwrite: true }); 
			sendmsg(c.client, msg_uploadcomplete, JSON.stringify({ 
				id: hash,
				cache_size: c.cache_size,
				state: "ok"
			}));

			uploadprocs[hash] = null;

		} else {
			// 继续
			sendmsg(c.client, msg_uploadproc, JSON.stringify({
				id: hash,
				cache_size: c.cache_size,
				state: "upload"
			}));

        }

	} 
}



function startUploadServer(port) {

	wss = new WebSocket.Server({
		port: port,
		maxPayload: 0 //9.9e+7 // 99mb
	});


	wss.on('connection', function connection(client) {

		client.ids = client_ids++; 
		//sendmsg(client, msg_auth, JSON.stringify({ need_auth: need_auth, client_id: client.ids }));
 
		client.on('message', async data => {

			var msgid = WUtil.BytesToInt(data.slice(0, 4));
			console.log(" msgid = " + msgid);

			switch (msgid) {

				case msg_auth:

					var is_auth = false;
					if (need_auth) {
						var msga = WUtil.Utf8ArrayToStr(data.slice(4));
						var authjson = JSON.parse(msga.toString());

						if (authjson.auth) {
							is_auth = auth_codes[authjson.auth];
						} else {
							is_auth = true;
						}
					} else {
						is_auth = true;
                    }

					client.auth = is_auth;  
					sendmsg(client, msg_auth, JSON.stringify({ auth: is_auth }));

					break;
				case msg_uploadstart: 
					if (need_auth && !client.auth)
						return; 
					var msg = WUtil.Utf8ArrayToStr(data.slice(4));
					var filesjson = JSON.parse(msg.toString());
					var infos = [];
					for (let i = 0; i < filesjson.length; i++) {
						infos.push(addUploadQueue(client, filesjson[i]));
					}
					sendmsg(client, msg_uploadstart, JSON.stringify(infos));
					break;
				case msg_uploadproc: 
					if (need_auth && !client.auth)
						return; 
					var hashlen = WUtil.BytesToInt(data.slice(4, 8)); 
					var hash = WUtil.Utf8ArrayToStr(data.slice(8, 8 + hashlen));
					var d = data.slice(8 + hashlen); 
					appendUploadBuff(hash, d);
					break;
            } 
		});
	});
}


 
 
 



var WUtil = {

	//string转byte
	stringToByte:function(str) {
		var bytes = new Array();
		var len, c;
		len = str.length;
		for (var i = 0; i < len; i++) {
			c = str.charCodeAt(i);
			if (c >= 0x010000 && c <= 0x10FFFF) {
				bytes.push(((c >> 18) & 0x07) | 0xF0);
				bytes.push(((c >> 12) & 0x3F) | 0x80);
				bytes.push(((c >> 6) & 0x3F) | 0x80);
				bytes.push((c & 0x3F) | 0x80);
			} else if (c >= 0x000800 && c <= 0x00FFFF) {
				bytes.push(((c >> 12) & 0x0F) | 0xE0);
				bytes.push(((c >> 6) & 0x3F) | 0x80);
				bytes.push((c & 0x3F) | 0x80);
			} else if (c >= 0x000080 && c <= 0x0007FF) {
				bytes.push(((c >> 6) & 0x1F) | 0xC0);
				bytes.push((c & 0x3F) | 0x80);
			} else {
				bytes.push(c & 0xFF);
			}
		}
		return bytes; 
	},


	// Buffer ---> ArrayBuffer
	toArrayBuffer: function(buf) {
		var ab = new ArrayBuffer(buf.length);
		var view = new Uint8Array(ab);
		for (var i = 0; i < buf.length; ++i) {
			view[i] = buf[i];
		}
		return ab;
	},
	Uint8ArrayToString: function (fileData) {
		var dataString = "";
		for (var i = 0; i < fileData.length; i++) {
			dataString += String.fromCharCode(fileData[i]);
		}
		return dataString
	},

	Utf8ArrayToStr: function(array) {
		var out, i, len, c;
		var char2, char3;

		out = "";
		len = array.length;
		i = 0;
		while (i < len) {
			c = array[i++];
			switch (c >> 4) {
				case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
					// 0xxxxxxx
					out += String.fromCharCode(c);
					break;
				case 12: case 13:
					// 110x xxxx   10xx xxxx
					char2 = array[i++];
					out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
					break;
				case 14:
					// 1110 xxxx  10xx xxxx  10xx xxxx
					char2 = array[i++];
					char3 = array[i++];
					out += String.fromCharCode(((c & 0x0F) << 12) |
						((char2 & 0x3F) << 6) |
						((char3 & 0x3F) << 0));
					break;
			}
		}

		return out;
	},

	//小端模式
	BytesToInt: function(bytes) {
		var val = 0;
		for (var i = bytes.length - 1; i >= 0; i--) {
			val += bytes[i];
			if (i !== 0) {
				val = val << 8;
			}
		}
		return val;
	},

	//小端模式
	//number 要转换的整形数值
	//length 要转成什么byte数组，规定数组的长度
	//如uint16，则lenght=2表示两个字节，转成的byte数组长度是length=2
	//如uint32，则lenght=2表示两个字节，转成的byte数组长度是length=4
	IntToBytes:function (number, length = 4) {
		var bytes = [];
		var i = 0;
		do {
			bytes[i++] = number & (255);
			number = number >> 8;
		} while (i < length)
		return bytes;
	},

	//byte数组转换为int整数
	bytesToInt2: function (bytes, off) {
		var b3 = bytes[off] & 0xFF;
		var b2 = bytes[off + 1] & 0xFF;
		var b1 = bytes[off + 2] & 0xFF;
		var b0 = bytes[off + 3] & 0xFF;
		return (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
	}, 
	//byte数组转字符串
	byteToString: function (arr) {
		if (typeof arr === 'string') {
			return arr;
		}
		var str = '',
			_arr = arr;
		for (var i = 0; i < _arr.length; i++) {
			var one = _arr[i].toString(2),
				v = one.match(/^1+?(?=0)/);
			if (v && one.length == 8) {
				var bytesLength = v[0].length;
				var store = _arr[i].toString(2).slice(7 - bytesLength);
				for (var st = 1; st < bytesLength; st++) {
					store += _arr[st + i].toString(2).slice(2);
				}
				str += String.fromCharCode(parseInt(store, 2));
				i += bytesLength - 1;
			} else {
				str += String.fromCharCode(_arr[i]);
			}
		}
		return str;
	},
	//int整数转换为4字节的byte数组
	intToByte4: function (i) {
		var targets = [];
		targets[0] = (i & 0xFF);
		targets[1] = (i >> 8 & 0xFF);
		targets[2] = (i >> 16 & 0xFF);
		targets[3] = (i >> 24 & 0xFF);
		return targets;
	}, 
}



var wsu = {

	//初始化
	init: function (port, _folder ) {
		startUploadServer(port);

		if (_folder) {
			upload_path = _folder;
		} 
		
	},

	// 设置验证code
	set_auth: function (_need_auth, auth_code_array) {
		need_auth = _need_auth;
		for (var i = 0; auth_code_array && i < auth_code_array.length; i++) {
			auth_codes[auth_code_array[i]] = auth_code_array[i];
        }
	},

	add_auth_code: function (auth_code) {
		auth_codes[auth_code] = auth_code;
    }

}


module.exports = wsu;
 

