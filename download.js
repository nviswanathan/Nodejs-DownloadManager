
var _http = require("http");
var _https = require("https");
var _url = require("url");
var _fs = require('fs');
var _path = require('path');
var _mkdirp = require('mkdirp');
var events = require("events");

function download(url, dest_path, number_of_split){
    var syncCompleted = false;
    var url_data = _url.parse(url),
        _isSSL = url_data.port == "443" || url_data.protocol == "https:",
        http = _isSSL ? _https : http,
        file_name = _path.basename(url_data.pathname),
        file_path = _path.join(dest_path, file_name)
        emitter = new events.EventEmitter(), 
        downloads = [],
        number_of_parts = number_of_split || 4, 
        min_part_size = (1024 * 1024)/2 ;
        file_size = null;
        fd = null;

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
        if(!_path.exists(dest_path)){
            _mkdirp.sync(dest_path);
        }
        fd = _fs.openSync(file_path, "w");  
        getFileDetails(function(headers, err){
            if(err) throw err
            else {
                emitter.emit('start', headers);
                file_size = parseInt(headers["content-length"]);
                console.log("file_size", file_size);
                var no_parts = file_size <= min_part_size ? 1 : parseInt(file_size/min_part_size);
                no_parts =  number_of_parts >= no_parts ? no_parts :  number_of_parts;
                var part_size =  no_parts > 1 ? parseInt(file_size/number_of_parts) : file_size, 
                    end = 0;
                // var no_parts = 1;
                // var part_size = file_size, end = 0;
                var message = {file_name: file_name, file_size: file_size, no_parts: no_parts};
                writeOutPut(message);
                for(var index=0; index < no_parts; index++){
                    var next_start = end+part_size;
                    if(index+1 == no_parts && next_start != file_size){
                        //Remining files are 
                        var remining = file_size - end;
                        next_start = end + remining;
                    }
                    console.log("End ", next_start);
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
            callback(res.headers);
            req.abort();
        }).on("error", function(err){ 
            callback(null, err);
            emitter.emit('error', err);
        });
        //while(sync==true){ _sleep(100); }
        return headers;
    }

    function updateProgress(){
        var complted = 0;
        downloads.forEach(function(data){
            complted += data.msg.completed - data.msg.start;
        })
    }


    function checkCompleted(){
        var isCompleted = downloads.filter(function(data){
            return data.isCompleted;
        }).lenght > 0;

        if(isCompleted){
            syncCompleted = true;
            emitter.emit("end", {});
            _fs.close(fd);
            abort();
        }
        //_sleep(100);
    }    

    function downloadRange(start, end, fd, offset){
        var startTime = new Date();
        var options = getOptions();
        console.log("Download Rang: ", start + "-" + end);
        options.headers["Range"] = "bytes=" +start + "-" + end;
        downloads.push(options);
        var msg = {};
        var req = http.get(options, function(res) {
            // console.log("Headers", res.headers, start, end)
            console.log("Start Download", offset);
            res.on('data', function (chunk) {
                // _fs.writeSync(fd, chunk, start);
                _fs.writeSync(fd, chunk, 0, chunk.length, start);
                // console.log("writed Sync:", chunk.toString());
                start += chunk.length;
                msg.completed = start;
                updateProgress();
            });
            res.on("end", function(){        
                console.log("Completed", new Date().getTime() - startTime.getTime());
                msg.isCompleted = true;
                checkCompleted();
            })
            
        }).on("error", function(err){ 
            console.log("error", err)
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

    function abort(){
        downloads.forEach(function(data){
            data.req.abort();
            fs.unlink(file_path)
        });
        emitter = null;
        downloads = null;
        fd = null;
        url_data = null;
    }

    return {
        on: function(eventName, callback){
            emitter.on(eventName, callback);
        },

        cancel: function(){
            abort();
        }, 

        start: function() {
            start();
        }
    }
}

module.exports.Download = download;

// var url = "https://quad42media.s3.amazonaws.com:443/quad42_media/12/2/108323_1600_1200.jpg?Signature=HUXLp7gzkZMXgMQyrjR%2FU%2FbChR4%3D&Expires=1531554303&AWSAccessKeyId=AKIAJERVIHAFBYJADXGQ&x-amz-meta-media_properties=%7B%22format%22%3A%20%22JPEG%22%2C%20%22resolution%22%3A%20%7B%22height%22%3A%201200%2C%20%22width%22%3A%201600%7D%7D&x-amz-meta-size=981967&x-amz-meta-content_type=image/jpeg&x-amz-meta-last_modified=2018-03-03%2015%3A27%3A21.459820&x-amz-meta-tags=%5B%5D";

// dwd = download(url, "/tmp/to")
// dwd.start();



/*

var url = "https://quad42media.s3.amazonaws.com:443/quad42_media/12/2/a2.jpg?Signature=j4YM8rIF2fHFW0zXjPVvYBJ%2B0%2BQ%3D&Expires=1531496672&AWSAccessKeyId=AKIAJERVIHAFBYJADXGQ&x-amz-meta-media_properties=%7B%22format%22%3A%20%22JPEG%22%2C%20%22resolution%22%3A%20%7B%22height%22%3A%201080%2C%20%22width%22%3A%201920%7D%7D&x-amz-meta-size=426213&x-amz-meta-content_type=image/jpeg&x-amz-meta-last_modified=2018-03-03%2015%3A24%3A37.344602&x-amz-meta-tags=%5B%5D",
 url_data = _url.parse(url),
_isSSL = url_data.port == "443",
http = _isSSL ? _https : http,
options = {
    hostname: url_data.hostname,
    port: url_data.port, 
    path: url_data.path, 
    method: 'GET'
};

function getFileDetails(callback){
    var sync = true, headers = null;
    //options.headers = { "Range": 0-1 }
    var req = http.get(options, function(res) {
        console.log("Headers", res.headers)
        callback(res.headers);
        req.abort();
    }).on("error", function(err){ 
        callback(null, err);
        emitter.emit('error', err);
    });
    //while(sync==true){ _sleep(100); }
    return headers;
}

*/