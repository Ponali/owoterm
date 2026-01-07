const version = "1.1.0";

const fs = require("node:fs");
const json5 = require("json5");
const settingsFile = process.argv[2]??"settings.json5";
console.log("reading config file from",settingsFile);
const settings = json5.parse(fs.readFileSync(settingsFile,"utf8"));

const { Worker } = require('worker_threads');
const stream = require("./stream.js")(settings);
const parseChars = require("./parse.js");

const worker = new Worker('./bot-worker.js');
worker.postMessage({type:"settings",settings,version})

worker.on('message',(msg)=>{
    if(msg.type=="streamWrite"){
        stream.write(msg.str);
    }
    if(msg.type=="streamUnshift"){
        stream.unshift(msg.str);
    }
    if(msg.type=="hardReset") stream.hardReset();
    if(msg.type=="softReset") stream.softReset();
    if(msg.type=="ready"){
        (async function(){
           while(true){
               await parseChars(stream.read,worker.postMessage.bind(worker));
           }
        })();
        // TODO: add an interval that shows the amount of characters left in the buffer
    }
    if(msg.type=="exit"){
        process.exit();
    }
});

process.on('SIGINT',function(){
    console.log("\r\x1b[2Kstopping...");
    stream.quit().then(()=>{
        worker.postMessage({type:"exit"});
    })
});
