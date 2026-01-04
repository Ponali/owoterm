// NOTE: this file is a worker and runs in a different thread.
const { parentPort } = require('worker_threads');

let version;
let world,width,height;
let offsetX,offsetY;
let showVersion,showNerdFontHyperlink;

const owot = require("simple-owot-bot");
let bot;
const input = require("./input.js");
const tty = require("./tty.js");

function sleep(n){
    return new Promise(resolve=>{
        setTimeout(resolve,n)
    })
}

function writeText(x,y,s,fg,bg,link){
    let ox = x+offsetX;
    let oy = y+offsetY;
    for(let i=0;i<s.length;i++){
        input.flagCharUpdated(ox+i,oy,s[i],fg,bg);
    }
    bot.writeText(ox,oy,s,fg,bg);
    if(link){
        bot.flushWrites(); // NOTE: normally this is asynchronous but this somehow doesn't return a promise so .then() doesn't work
        for(let i=0;i<s.length;i++){
            bot.urlLink(ox+i,oy,link);
        }
    }
}

function writeChar(x,y,c,fg,bg,link){
    let ox = x+offsetX;
    let oy = y+offsetY;
    input.flagCharUpdated(ox,oy,c,fg,bg);
    bot.writeChar(ox,oy,c,fg,bg);
    if(link){
        bot.flushWrites(); // see comment in writeText
        bot.urlLink(ox,oy,link);
    }
}

async function handleMessage(m){
    if(m.type=="exit"){
        await bot.flushWrites();
        return parentPort.postMessage({type:"exit"})
    }

    await tty.handleMessage(m);
}

// message queue system so that it doesn't desync

let lastMessageTimestamp = Date.now();
async function onConnect(){
    console.log("connected!");
    if(showVersion){
        let mainColor = 0x808080;
        let versionString = versionFormat.replace("%v",version);
        writeText(0,-1," ".repeat(width));
        writeText(0,-1,versionString,mainColor,-1,"https://github.com/Ponali/owoterm");
        if(showNerdFontHyperlink){
            writeChar(versionString.length+1,-1,"·",mainColor);
            writeText(versionString.length+3,-1,"Notice on Nerd fonts",mainColor,-1,"https://github.com/Ponali/owoterm#notice-on-nerd-fonts");
        }
    }
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

let token;
function spawnBot(){
    bot = new owot.Bot(`wss://ourworldoftext.com/${world}/ws/?hide=1`,token);
    bot.on("connected",onConnect);
    bot.on("disconnected",function(){
        console.warn("warning: bot got disconnected")
        spawnBot();
    })
}

parentPort.on("message",async (m)=>{
    if(m.type=="settings"){
        version = m.version;
        ({world,width,height,offsetX,offsetY,showVersion,versionFormat,showNerdFontHyperlink} = m.settings); // why???????????????????????
        input.settings(m.settings);
        const tokenFile = m.settings.token??"token.txt";
        console.log("reading token from file",tokenFile);
        try{
            token = require('node:fs').readFileSync(tokenFile,"utf8").replaceAll("\n","");
        } catch (e){
            console.error("cannot read token file, trying to log in as a guest.",e)
        }
        spawnBot();

        tty.init(bot,parentPort,writeChar,writeText,m.settings);
    } else {
        messageQueue.push(m);
    }
})
