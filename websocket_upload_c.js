


var WUtil = {

 
	BytesToInt: function (bytes) {
		var val = 0;
		for (var i = bytes.length - 1; i >= 0; i--) {
			val += bytes[i];
			if (i !== 0) {
				val = val << 8;
			}
		}
		return val;
	},

 
	IntToBytes: function (number, length = 4) {
		var bytes = [];
		var i = 0;
		do {
			bytes[i++] = number & (255);
			number = number >> 8;
		} while (i < length)
		return bytes;
	},
	 
	concat2: function(...arrays) {

		let totalLen = 0; 
		for (let arr of arrays) 
			totalLen += arr.byteLength;

		let res = new Uint8Array(totalLen) 
		let offset = 0;
		for (let arr of arrays) { 
			let uint8Arr = new Uint8Array(arr); 
			res.set(uint8Arr, offset); 
			offset += arr.byteLength; 
		} 
		return res.buffer; 
	}, 

	//
	Uint8ArrayToString: function(fileData){
		var dataString = "";
		for (var i = 0; i < fileData.length; i++) {
			dataString += String.fromCharCode(fileData[i]);
		}  
		return dataString 
	},

	Utf8ArrayToStr: function (array) {
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

	toUint8Arr: function(str) {
		const buffer = [];
		for (let i of str) {
			const _code = i.charCodeAt(0);
			if (_code < 0x80) {
				buffer.push(_code);
			} else if (_code < 0x800) {
				buffer.push(0xc0 + (_code >> 6));
				buffer.push(0x80 + (_code & 0x3f));
			} else if (_code < 0x10000) {
				buffer.push(0xe0 + (_code >> 12));
				buffer.push(0x80 + (_code >> 6 & 0x3f));
				buffer.push(0x80 + (_code & 0x3f));
			}
		}
		return Uint8Array.from(buffer);
	},


	concat: function(...arrays) {
		let totalLen = 0;

		for (let arr of arrays) 
			totalLen += arr.byteLength;

		let res = new Uint8Array(totalLen); 
		let offset = 0;

		for (let arr of arrays) { 
			let uint8Arr = new Uint8Array(arr); 
			res.set(uint8Arr, offset); 
			offset += arr.byteLength; 
		}

		return res.buffer;
	} 

};

const msg_auth = 5;
const msg_info = 8;
const msg_uploadstart = 10;
const msg_uploadproc = 20;
const msg_uploadcomplete = 30;
const maxChunkSize =    5e+7; // 50mb

var websocket_upload_c = {

	ws: null,
	auth_cb: null,
	info_cb: null,
	start_cb: null,
	process_cb: null,
	complete_cb: null, 
	uploader: {},
	upload_files:[],
	auth_code: null,
	auth_state: false,

    // 链接
	connect: function (ip, port, _auth_code) {
		var t = this;
		t.ws = new WebSocket('ws://' + ip + ':' + port); 
		t.ws.addEventListener('open', function (event) {
			if (_auth_code && _auth_code !== "") {
				t.auth_code = _auth_code;
				t._send_message(msg_auth, JSON.stringify({ auth: _auth_code }));
            }
		});

		// Listen for messages
		t.ws.addEventListener('message', function (event) {

			var b = event.data; 

			b.arrayBuffer().then(res => {
				
				var msgid = WUtil.BytesToInt(Array.from(new Uint8Array(res).slice(0,4))); 
				
				var s = JSON.parse(WUtil.Utf8ArrayToStr(new Uint8Array(res).slice(4)));

				switch (msgid) {
					case msg_auth: 
						var authstat = s.auth;
						if (authstat) {
							t.auth_state = true;
						}

						if (t.auth_cb)
							t.auth_cb(authstat);

						break;
					case msg_info:
						if (t.info_cb)
							t.info_cb(s); 
						break;
					case msg_uploadstart:

						for (let i = 0; i < s.length; i++) {
							let index = t._find_upload_file(s[i].name); 
							if (index >= 0) { 
								var u = t.upload_files[index];
								var id = s[i].id;
								t.uploader[id] = {
									id: id,
									cache_size: 0,
									file: u.file,
									size: u.size,
									type: u.type,
									name: u.name,
									date: u.lastModified, 
								}
                            }
						}  

						if (t.start_cb)
							t.start_cb(s);

						t._start_proc();

						break;
					case msg_uploadproc:

						var hash = s.id;
						var cache_size = s.cache_size; 
						if (t.uploader[hash]) {
							t.uploader[hash].cache_size = cache_size;

							if (t.process_cb) {
								t.process_cb({
									id: hash,
									name: t.uploader[hash].name,
									pct: cache_size / t.uploader[hash].size,
								});
							}

							t._send_proc(hash, t.uploader[hash]);
						}
						break;
					case msg_uploadcomplete: 
						if (t.complete_cb)
							t.complete_cb({
								id: s.id,
								name: t.uploader[s.id].name,
							});
						break;
                } 

			}); 

		}); 

	},

	_add_upload_file_when_server: function (file) {
		this.upload_files.push({
			name: file.name,
			file: file,
			size: file.size,
			type: file.type, 
			date: file.lastModified,
		});
	},

	_find_upload_file: function (filename) {
		for (let i = 0; i < this.upload_files.length; i++) {
			if (filename === this.upload_files[i].name) {
				return i;
            }
		}
		return -1;
    },
	_del_upload_file: function (filename) {
		let i = this._find_upload_file(filename);
		if (i >= 0) {
			this._find_upload_file.splice(i);
        }
    },

  
	_start_proc: function () {
		var t = this; 
		for (let key in t.uploader) {
			t._send_proc(key, t.uploader[key]);
		}
	},

	_send_proc: function (hash, queue) {  
		var cache_size = queue.cache_size; 
		var blobpart = queue.file.slice(cache_size, cache_size + maxChunkSize);
		this._send_buff(msg_uploadproc, hash, blobpart);
	},

	_send_buff: function (msg_id, hash, blob) {
		var t = this;
		var mid = new Uint8Array(WUtil.IntToBytes(msg_id)).buffer;
		var hash_buf = WUtil.toUint8Arr(hash).buffer;
		var hash_len = new Uint8Array(WUtil.IntToBytes(hash_buf.byteLength)).buffer;

		blob.arrayBuffer().then(buf => { 
			var rs = WUtil.concat(mid, hash_len, hash_buf, buf);
			t.ws.send(rs);
		}); 
 
	},

	_send_message: function (msg_id, msg_str) {
		var t = this;
		var m = new Uint8Array(WUtil.IntToBytes(msg_id)).buffer;
		var s = WUtil.toUint8Arr(msg_str).buffer;
		var rs = WUtil.concat2(m, s);
		t.ws.send(rs); 
	},


	_get_fils_ids: function (files) {
		var t = this;
		var files_info = [];
		for (let i = 0; i < files.length; i++) {

			files_info.push({
				size: files[i].size,
				type: files[i].type,
				name: files[i].name,
				date: files[i].lastModified,
			});

			t._add_upload_file_when_server(files[i]); 
		}
		t._send_message(msg_uploadstart, JSON.stringify(files_info));
    },


	set_callback: function (callbacks) {

		var t = this;
		if (callbacks) {
			if (callbacks["auth_cb"])
				t.auth_cb = callbacks["auth_cb"];
			if (callbacks["info_cb"])
				t.info_cb = callbacks["info_cb"];
			if (callbacks["start_cb"])
				t.start_cb = callbacks["start_cb"];
			if (callbacks["process_cb"])
				t.process_cb = callbacks["process_cb"];
			if (callbacks["complete_cb"])
				t.complete_cb = callbacks["complete_cb"];
		}

    },
  

	upload: function (files) { 
		this._get_fils_ids(files);
	},


	upload_direct: function (files, files_info) {

		var t = this;

		for (var f = 0; f < files.length; f++) {
			t._add_upload_file_when_server(files[f]);
		} 

		for (let i = 0; i < files_info.length; i++) {
			let index = t._find_upload_file(files_info[i].name);  
			if (index >= 0) {
				var u = t.upload_files[index];  
				var id = files_info[i].id;  
				t.uploader[id] = {
					id: id,
					cache_size: 0,
					file: u.file,
					size: u.size,
					type: u.type,
					name: u.name,
					date: u.lastModified,
				}
			}
		}

		if (t.start_cb)
			t.start_cb(files_info);

		t._start_proc();

    }




}
