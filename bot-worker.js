// NOTE: this file is a worker and runs in a different thread.
const { parentPort } = require('worker_threads');

let world,width,height;
let offsetX,offsetY;

const owot = require("simple-owot-bot");
let bot;
const input = require("./input.js");
const tty = require("./tty.js");

function sleep(n){
    return new Promise(resolve=>{
        setTimeout(resolve,n)
    })
}

function writeText(x,y,s,fg,bg){
    let ox = x+offsetX;
    let oy = y+offsetY;
    for(let i=0;i<s.length;i++){
        input.flagCharUpdated(ox+i,oy,s[i],fg,bg);
    }
    bot.writeText(ox,oy,s,fg,bg);
}

function writeChar(x,y,c,fg,bg){
    let ox = x+offsetX;
    let oy = y+offsetY;
    input.flagCharUpdated(ox,oy,c,fg,bg);
    bot.writeChar(ox,oy,c,fg,bg);
}

async function handleMessage(m){
    if(m.type=="exit"){
        return parentPort.postMessage({type:"exit"})
    }

    await tty.handleMessage(m);
}

// message queue system so that it doesn't desync

let lastMessageTimestamp = Date.now();
async function onConnect(){
    console.log("connected!");
    // writeText(0,-1,"OWOTerm [WIP]");
    await tty.onConnect();
    await input.init([bot,parentPort,writeChar,writeText,offsetX,offsetY,width,height,tty.reload]);
    parentPort.postMessage({type:"ready"});
    while(true){
        if(messageQueue.length>0){
            await tty.onPendingQueue(lastMessageTimestamp);
            await handleMessage(messageQueue[0]);
            messageQueue.shift();
            lastMessageTimestamp = Date.now();
        } else {
            await tty.onEmptyQueue(lastMessageTimestamp);
            await sleep(100);
        }
        // console.error(messageQueue.length,cursorShown);
    }
}

let messageQueue = [];

parentPort.on("message",async (m)=>{
    if(m.type=="settings"){
        ({world,width,height,offsetX,offsetY} = m.settings); // why???????????????????????
        input.settings(m.settings);
        const tokenFile = m.settings.token??"token.txt";
        console.log("reading token from file",tokenFile);
        let token;
        try{
            token = require('node:fs').readFileSync(tokenFile,"utf8").replaceAll("\n","");
        } catch (e){
            console.error("cannot read token file, trying to log in as a guest.",e)
        }

        bot = new owot.Bot(`wss://ourworldoftext.com/${world}/ws/?hide=1`,token);
        bot.on("connected",onConnect);

        tty.init(bot,parentPort,writeChar,writeText,m.settings);
    } else {
        messageQueue.push(m);
    }
})
