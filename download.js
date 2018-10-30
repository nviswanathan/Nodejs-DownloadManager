var _http = require("http");
var _https = require("https");
var _url = require("url");
var _fs = require('fs');
var _path = require('path');
var _mkdirp = require('mkdirp');
var events = require("events");

function download(url, dest_path, file_name, number_of_split){
    var syncCompleted = false;
    var url_data = _url.parse(url),
        _isSSL = url_data.port == "443" || url_data.protocol == "https:",
        http = _isSSL ? _https : http,
        file_name = file_name || _path.basename(url_data.pathname),
        file_path = _path.join(dest_path, file_name),
        emitter = new events.EventEmitter(), 
        downloads = [],
        number_of_parts = number_of_split || 4, 
        min_part_size = 1024 * 1024, //Min 1 MB per part
        file_size = null,
        fd = null,
        stop_download = false;

    if(dest_path == null){
        throw new Error("Invalid Path Configuration")
    }


    // if(!_path.esists(dest_path)){
    //     throw new Error("Invalid Destionation Path");
    // }


    function getOptions(){
        return options = {
            hostname: url_data.hostname,
            port: url_data.port, 
            path: url_data.path, 
            method: 'GET',
            agent: false,
            headers: {}
        };
    }

    function writeOutPut(message){
        var stringify = JSON.stringify(message);
        _fs.writeSync(fd, stringify, file_size);
    }

    function start(){
        if(!_fs.existsSync(dest_path)){
            _mkdirp.sync(dest_path);
        }
        fd = _fs.openSync(file_path, "w");  
        getFileDetails(function(headers, err){
            if(err) throw err
            else if(!stop_download){
                emitter.emit('start', headers);
                file_size = parseInt(headers["content-length"]);
                // console.log("file_size", file_size);
                var no_parts = file_size <= min_part_size ? 1 : parseInt(file_size/min_part_size);
                no_parts =  number_of_parts >= no_parts ? no_parts :  number_of_parts;
                var part_size =  no_parts > 1 ? parseInt(file_size/number_of_parts) : file_size, 
                    end = 0;
                // var no_parts = 1;
                // var part_size = file_size, end = 0;
                var message = {file_name: file_name, file_size: file_size, no_parts: no_parts, fdW: fd};
                writeOutPut(message);
                for(var index=0; index < no_parts; index++){
                    var next_start = end+part_size;
                    if(index+1 == no_parts && next_start != file_size){
                        //Remining files are 
                        var remining = file_size - end;
                        next_start = end + remining;
                    }
                    downloadRange(end, next_start-1, fd, index);
                    end = next_start;
                }
            }
        }); 
        // while(!syncCompleted){ checkCompleted(); };     
    }

    function getFileDetails(callback){
        var sync = true, headers = null;
        var options = getOptions();
        // options.headers = { "Range": "bytes=0-1" }
        var req = http.get(options, function(res) {
            emitter.emit('response', res);
            callback(res.headers);
            req.abort();
        }).on("error", function(err){ 
            callback(null, err);
            emitter.emit('error', err);
        });
        emitter.emit('request', req);
        //while(sync==true){ _sleep(100); }
        return headers;
    }

    function updateProgress(){
        var completed = 0;
        downloads.forEach(function(data){
            completed += data.msg.completed - data.msg.start;
        })
        emitter.emit("progress", {totalSize: file_size, 
            completed: completed, 
            progress: parseInt((completed/file_size)*100)
        })
    }

    function isRunning(){
        var unCompleted = downloads.filter(function(data){
            return !data.msg.isCompleted;
        });
        return unCompleted.length > 0;
    }


    function checkCompleted(options){;
        if(!isRunning() && !stop_download){
            try{
                var status = _fs.statSync(file_path);
                _fs.truncate(fd, file_size,function(){
                    _fs.closeSync(fd);
                    emitter.emit("end", {fileName: file_name, filePath: file_path});
                    abort(true);
                });
            } catch(ex){
                console.log("Error on download complete:"+ ex.message);
            }
        }
        //_sleep(100);
    }    

    function downloadRange(start, end, fd, offset){
        var startTime = new Date();
        var options = getOptions();
        console.log("Download Rang: ", start + "-" + end);
        options.headers["Range"] = "bytes=" +start + "-" + end;
        downloads.push(options);
        var msg = {completed: start};
        var req = http.get(options, function(res) {
            // console.log("Headers", res.headers, start, end)
            console.log("Start Download", offset);
            res.on('data', function (chunk) {
                if(!stop_download){
                    try{
                    // _fs.writeSync(fd, chunk, start);
                    _fs.writeSync(fd, chunk, 0, chunk.length, start);
                    // console.log("writed Sync:", chunk.toString());
                    start += chunk.length;
                    msg.completed = start;
                    updateProgress();
                    } catch(ex) {
                        console.log("Error on writing the file on download:" + ex.message);
                        throw ex;
                    }
                }else {
                    console.log("Download Stoped:" + file_name);
                    res.req.abort();
                }
            });
            res.on("end", function(){        
                console.log("Completed", new Date().getTime() - startTime.getTime());
                msg.isCompleted = true;
                checkCompleted(options);
            })
            
        }).on("error", function(err){ 
            console.log("error", err)
            msg.error = err.message;
            msg.invalid = true;
        }).on("end", function(){
            console.log("Completed", new Date().getTime() - startTime.getTime());
            msg.isCompleted = true;
            checkCompleted();
        });

        options.msg = msg; 
        options.req = req;
        msg.start = start;
        msg.end = end;
        msg.fd = fd;

    }

    function resume(){

    }

    function retry(){

    }

    function abort(isCompleted){
        stop_download = true;
        downloads.forEach(function(data){
            data.req.abort();
        });
        if(!isCompleted){
            _fs.unlinkSync(file_path)
        }
        emitter =  downloads = fd =  url_data = null;
    }

    return {
        on: function(eventName, callback){
            emitter.on(eventName, callback);
        },

        cancel: function(){
            let em = emitter;
            try{
                abort();
                em.emit("cancel", {fileName: file_name});
            } catch(ex){
                console.log("Exception:",ex);    
                em.emit("cancel-error", {});            
            }
        }, 

        resume: function(){
            resume();
        },

        retry: function(){
            retry();
        },

        isRunning: function(){
            return isRunning();
        },

        start: function() {
            setTimeout(()=>{
                start();
            }, 10)
        }
    }
}

module.exports.Download = download;

/*
var url = "https://quad42media.s3.amazonaws.com:443/quad42_media/12/2/108323_1600_1200.jpg?Signature=XhAgwitoItC%2B8F1AONqp1ZYs5GA%3D&Expires=1531563034&AWSAccessKeyId=AKIAJERVIHAFBYJADXGQ&x-amz-meta-media_properties=%7B%22format%22%3A%20%22JPEG%22%2C%20%22resolution%22%3A%20%7B%22height%22%3A%201200%2C%20%22width%22%3A%201600%7D%7D&x-amz-meta-tags=%5B%5D&x-amz-meta-content_type=image/jpeg&x-amz-meta-size=981967&x-amz-meta-last_modified=2018-03-03%2015%3A27%3A21.459820";

dwd = download(url, "./download")
dwd.on("start", function(data){
    console.log("Start", data)
})
dwd.on("progress", function(data){
    console.log("progress", data)
})

dwd.on("end", function(data){
    console.log("end", data)
})

dwd.on("error", function(data){
    console.log("error", data)
})

dwd.start();
*/