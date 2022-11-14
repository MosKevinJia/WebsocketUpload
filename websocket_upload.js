'use strict';
const WebSocket = require('ws');
const uuid = require('uuid');
const jetpack = require('fs-jetpack');  
var path = require("path"); 
 
var client_ids = 0;
var clients = [];
var uploadprocs = {};
var wss = null;
var upload_path = "../public/cache"; 
var need_auth = false;
var auth_codes = {};

var callbacks = {
	auth_cb: null,
	start_cb: null,
	process_cb: null,
	complete_cb: null, 
}

// msgid(4位), string_byte[......]
// msgid(4位), hash_length(4位), hash_str(...), filebyte[......]


const msg_auth = 5;
const msg_info = 8;
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

	var hash = uuid.v4() + '_' + file_info.size + '_' + file_info.date;
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
			suffix: file_info.name.split('.').pop(),
		}

		jetpack.dir(`${filepath}`);
		jetpack.file(`${filepath}/${cachefilename}`, { mode: "666" }); 

	}  

	return {
		id: hash,
		name: uploadprocs[hash].name,
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

			if (!wsu.isRename) {
				jetpack.rename(fullpath, c.name, { overwrite: true });
				fullpath = `${c.cache_path}\\${c.name}`;
			} else {
				var cachefilename = c.cache_name + "." + c.suffix;
				jetpack.rename(fullpath, cachefilename, { overwrite: true });
				fullpath = `${c.cache_path}\\${cachefilename}`;
            }

			sendmsg(c.client, msg_uploadcomplete, JSON.stringify({
				id: hash,
				cache_size: c.cache_size,
				state: "ok"
			}));

			uploadprocs[hash] = null;

			if (callbacks.complete_cb)
				callbacks.complete_cb({
					path: fullpath,
					name: c.name,
					hash: hash,
					size: c.cache_size,
					auth: c.client.auth,
				});

		} else {
			// 继续
			sendmsg(c.client, msg_uploadproc, JSON.stringify({
				id: hash,
				cache_size: c.cache_size,
				state: "upload"
			}));

			if (callbacks.process_cb)
				callbacks.process_cb({
					name: c.name,
					hash: hash,
					size: c.cache_size
				});

        }

	} 
}



function startUploadServer(port) {

	wss = new WebSocket.Server({
		port: port,
		maxPayload: 0//9.9e+7 // 99mb
	});

	wss.on('connection', function connection(client) {

		client.ids = client_ids++;
		clients.push(client);

		client.on('close', (code, reason) => { 
			for (let i = 0; i < clients.length; i++) {
				if (clients[i] && clients[i].ids === client.ids) {
					clients[i] = null;
					clients.splice(i);
                }
            } 
		});

		client.on('message', async data => {

			var msgid = WUtil.BytesToInt(data.slice(0, 4));
			//console.log(" msgid = " + msgid);

			switch (msgid) {

				case msg_auth:

					var is_auth = false;
					if (need_auth) {
						var msga = WUtil.Utf8ArrayToStr(data.slice(4));
						var authjson = JSON.parse(msga.toString());

						if (authjson.auth) {
							is_auth = auth_codes[authjson.auth];
						}

					} else {
						is_auth = true;
                    }

					client.auth = is_auth;  
					sendmsg(client, msg_auth, JSON.stringify({ auth: is_auth }));

					if (callbacks.auth_cb)
						callbacks.auth_cb(client, is_auth);

					break;
				case msg_info:


					break;
				case msg_uploadstart: 
					if (need_auth && !client.auth)
						return; 
					var msg = WUtil.Utf8ArrayToStr(data.slice(4));
					var filesjson = JSON.parse(msg.toString());
					var infos = [];
					var cbinfo = [];
					for (let i = 0; i < filesjson.length; i++) {
						var u = addUploadQueue(client, filesjson[i]);
						infos.push(u);
						cbinfo.push(uploadprocs[u.id]);
					}
					sendmsg(client, msg_uploadstart, JSON.stringify(infos));

					if (callbacks.start_cb)
						callbacks.start_cb(cbinfo);

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

	// 是否重新命名(flase=video1.mp4   true=DLELKDJFE232.mp4)
	isRename: true,

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

	// 
	findClient: function (_auth_code) {

		for (var i = 0; i < clients.length; i++) {
			if (clients[i].auth && clients[i].auth === _auth_code) {
				return clients[i];
            }
        }
    },

	// 添加验证
	add_auth_code: function (auth_code) {
		auth_codes[auth_code] = auth_code;
	},

	// 删除验证
	del_auth_code: function (auth_code) {
		auth_codes[auth_code] = null;
		delete auth_codes[auth_code];
    },

	// 设置回调
	set_callback: function (_callbacks) {
		callbacks = _callbacks;
	},

	// 设置路径
	set_cache_path: function (_path) {
		upload_path = _path;
	},

	//
	addQueues: function (client, files) {

		var infos = [];
		var cbinfo = [];
		for (let i = 0; i < files.length; i++) {
			var u = addUploadQueue(client, files[i]);
			infos.push(u);
			cbinfo.push(uploadprocs[u.id]);
		} 

		return infos;
	},

	//
	sendMsg: function (authcode, msg) { 
		var client = this.findClient(authcode);
		if (client) {
			sendmsg(client, msg_info, msg);
		}
    }

}


module.exports = wsu;
 

