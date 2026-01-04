const version = "1.0.0";

const fs = require("node:fs");
const json5 = require("json5");
const settingsFile = process.argv[2]??"settings.json5";
console.log("reading config file from",settingsFile);
const settings = json5.parse(fs.readFileSync(settingsFile,"utf8"));

const { Worker } = require('worker_threads');
const stream = require("./stream.js")(settings);

const worker = new Worker('./bot-worker.js');
// Worker.prototype.postMessage.call(worker,{type:"settings",settings}); // this SOMEHOW doesn't work unless if i do this
worker.postMessage({type:"settings",settings,version})

async function parseChars(){
    const char = await stream.read(1);

    if(char=="\x1b"){
        const header = await stream.read(1);
        if(header=="["){
            let code=""
            let final=""
            while((code.at(-1)??" ").charCodeAt(0)<0x40){
                code=code+(await stream.read(1));
            }
            final=code.at(-1)
            code=code.slice(0,-1)
            if(code[0]=="="){
                // most likely a very archaic DEC code, like "\x1b[=3h"
                return;
            }
            let special = code[0]=="?"
            if(special) code=code.slice(1);
            let exclamation = code[0]=="!"
            if(exclamation) code=code.slice(1);
            code=code.split(";").map(a=>parseInt(a)).map(a=>isNaN(a)?0:a);
            if(final!="m"){
                while(code.length<4) code.push(0);
            }
            worker.postMessage({type:"csi",final,code,special,exclamation});
        } else if(header=="]"){
            let code=""
            while(code.slice(-2)!="\x1b\\" && (code.at(-1)??" ")!="\x07" && (code.at(-1)??" ")!="\x9C"){
                code=code+(await stream.read(1));
            }
            code=code.slice(0,-2)
            let type=parseInt(code.split("\x07")[0]);
            // console.error(`ANSI OSC: ${JSON.stringify(code)}, type ${type}`)
            if(type==104){
                stream.unshift(code.split("\x07")[1]);
            }
            if(type==3008){
                const args = code.split(";").slice(1);
                worker.postMessage({type:"status",args});
            }
        } else if(header=="P"){
            let code=""
            while(code.slice(-2)!="\x1b\\" && (code.at(-1)??" ")!="\x9C"){
                code=code+(await stream.read(1));
            }
            // console.error(`ANSI DCS: ${JSON.stringify(code)}`)
        } else if(header=="("){
            // i don't know any program that uses anything else than UTF-8 or ASCII on the terminal
            await stream.read(1);
        } else if(header=="D"){
            worker.postMessage({type:"newline"});
        } else if(header=="M"){
            worker.postMessage({type:"newlinerev"})
        } else if(header==">"){
            // DECKPNM (basically turns on numlock)
            // since all input methods will use actual digits, this gets ignored
        } else if(header=="="){
            // DECKPAM (maybe also turns on numlock?)
            // again, this gets ignored
        } else if(header=="7"){
            worker.postMessage({type:"savecur"});
        } else if(header=="8"){
            worker.postMessage({type:"restorecur"});
        } else {
            console.error("Unknown ANSI code header: \\x1b\\x"+header.charCodeAt().toString(16).padStart(2,"0"));
            const str="[UNK-"+header.charCodeAt().toString(16).padStart(2,"0")+"]";
            // worker.postMessage({type:"str",str})
        }
    } else if(char=="\n"){
        worker.postMessage({type:"newline"});
    } else if(char=="\r"){
        worker.postMessage({type:"return"});
    } else if(char=="\t"){
        worker.postMessage({type:"tab"});
    } else if(char=="\x08"){
        worker.postMessage({type:"backspace"});
    } else if(char.charCodeAt()<32){
        if(char!="\x0f"){
            console.error("Unknown special ANSI character (\\x"+char.charCodeAt().toString(16).padStart(2,"0")+")")
        }
    } else {
        // TODO: fix bug that somehow makes both fgcolor and bgcolor white (including cleaning code)
        worker.postMessage({type:"char",char});
    }
}

worker.on('message',(msg)=>{
    if(msg.type=="streamWrite"){
        stream.write(msg.str);
    }
    if(msg.type=="hardReset") stream.hardReset();
    if(msg.type=="softReset") stream.softReset();
    if(msg.type=="ready"){
        (async function(){
           while(true){
               await parseChars();
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
