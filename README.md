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
  
  
  
