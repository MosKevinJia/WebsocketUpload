# WebsocketUpload
NodeJS Websocket Upload,  multiple files upload
多文件上传 


<b>Server Base Example:</b>
 ``` 
  var wsuploader = require('websocket_upload');
  wsuploader.init(6999);
 
 ```
  
  
<b>Client Base Example:</b>

 ```
 <script src="/js/websocket_upload_c.js"></script>
  websocket_upload_c.connect("127.0.0.1", 6999);
  websocket_upload_c.upload(files);     // <input type="file"  multiple>
 ```
  
  
<b>Client CallBack Example:</b>
  ```
  websocket_upload_c.set_callback({ 
      process_cb: (info) => {
          console.log("process_cb ", info.pct);
      },
      complete_cb: (info) => {
          console.log("complte_cb ", info);
      }
  });
  ```
  
  
  <b>Server Auth Example:</b>
  ```
        wsuploader.set_auth(true, ["client1_auth_code"]);
  ```
  
  <b>Client Auth Example:</b>
  ```
       websocket_upload_c.connect("127.0.0.1", 6999, "client1_auth_code");
  ```
  
  <b>客户端回调事件:</b>
   
   <b>auth_cb</b>  验证 <br />
   <b>info_cb</b>  服务端反馈消息 <br />
   <b>start_cb</b>  开始上传 <br />
   <b>process_cb</b>  上传进度 <br />
   <b>complete_cb</b>  上传完成 <br />
   
  <b>服务端端回调事件:</b>
   
   <b>auth_cb</b>  验证 <br />
   <b>start_cb</b>  开始上传 <br />
   <b>process_cb</b>  上传进度 <br />
   <b>complete_cb</b>  上传完成 <br />
   
   
   <b>客户端上传:</b><br />
   <b>upload(files)</b>     文件上传<br />
   <b>upload_direct(files, request_info)</b>    根据服务器返回的request info来上传<br />
   
   <b>服务端:</b><br />
   <b>init</b>     初始化<br />
   <b>set_auth</b>     设置验证code<br />
   <b>findClient</b>   查找客户端<br />
   <b>add_auth_code</b>     添加验证<br />
   <b>del_auth_code</b>     删除验证<br />
   <b>set_callback</b>     设置回调<br />
   <b>set_cache_path</b>     设置下载路径<br />
   <b>sendMsg</b>     发送消息<br />
   <b>addQueues</b>     添加下载队列<br />
   
   
   
   
   

  
  
