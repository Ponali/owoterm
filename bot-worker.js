// NOTE: this file is a worker and runs in a different thread.
const { parentPort } = require('worker_threads');

let world;
let width;
let height;
let offsetX;
let offsetY;
let loopscrolling;
let loopscrollResetTimeout;
let defaultbg;
let defaultfg;

const owot = require("simple-owot-bot");
let bot;
const sgr = require("./sgr.js");
const input = require("./input.js");

let bgcolor;
let fgcolor;
let invert = false;

let curx = 0;
let cury = 0;
let wrapSkip = false;
let curVisible = true;
let loopscroll = 0;

let curxSave = 0;
let curySave = 0;

let scrollRegionTop = 0;
let scrollRegionBot = 0;

let visual;

function writeCharToVisual(x,y,s,fg,bg){
    if(x>=0 && y>=0 && x<width && y<height){
        visual[y][x] = [s,fg,bg];
    }
}

function writeText(x,y,s,fg,bg){
    for(let i=0;i<s.length;i++){
        writeCharToVisual(x+i,y,s[i],fg,bg);
    }
    let ox = x+offsetX;
    let oy = y+offsetY;
    if(loopscrolling && y<height && y>=0){
        oy=(y+loopscroll)%height+offsetY;
    }
    for(let i=0;i<s.length;i++){
        input.flagCharUpdated(ox+i,oy,s[i],fg,bg);
    }
    bot.writeText(ox,oy,s,fg,bg);
}

function writeChar(x,y,c,fg,bg,toVisual){
    // debug
    if(y==height) console.log(`OOB x=${x} y=${y} curx=${curx} cury=${cury} wrapSkip=${wrapSkip} scrollRegion=${scrollRegionTop},${scrollRegionBot}`);

    if(toVisual || toVisual===undefined){
        writeCharToVisual(x,y,c,fg,bg);
    }
    let ox = x+offsetX;
    let oy = y+offsetY;
    if(loopscrolling && y<height && y>=0){
        oy=(y+loopscroll)%height+offsetY;
    }
    input.flagCharUpdated(ox,oy,c,fg,bg);
    bot.writeChar(ox,oy,c,fg,bg);
}

function indicateLoopScroll(){
    const color = loopscroll==0?0x00ff00:0x000040;
    writeChar(width+1,0,"┐",color);
    for(let i=1;i<height-1;i++){
        writeChar(width+1,i,"│",color);
    }
    writeChar(width+1,height-1,"┘",color);
}

async function scrollDown(n){
    if(loopscrolling && scrollRegionTop==0 && scrollRegionBot==height-1){
        loopscroll = (loopscroll+1)%height;
        for(let y=n;y<height;y++){
            for(let x=0;x<width;x++){
                visual[y-n][x] = visual[y][x];
            }
        }
        let [f,b] = invert?[bgcolor,fgcolor]:[fgcolor,bgcolor];
        for(let i=height-n;i<height;i++){
            writeText(0,i," ".repeat(width),f,b);
        }
        indicateLoopScroll();
    } else {
        /*const [x1,y1,x2,y2] = [offsetX,offsetY,width-1+offsetX,height-1+offsetY];
         await bot.flushWrites();
         await bot.fetchTiles(
             Math.floor(x1/16),Math.floor(y1/8),
             Math.floor(x2/16),Math.floor(y2/8)
             );*/
        for(let y=n+scrollRegionTop;y<=scrollRegionBot;y++){
            for(let x=0;x<width;x++){
                // const char = bot.getChar(x+offsetX,y+offsetY);
                // writeChar(x,y-n,char.char,char.color,char.bgColor);
                const char = visual[y][x];
                writeChar(x,y-n,char[0],char[1],char[2]);
            }
            await bot.flushWrites();
        }
        let [f,b] = invert?[bgcolor,fgcolor]:[fgcolor,bgcolor];
        for(let i=scrollRegionBot+1-n;i<=scrollRegionBot;i++){
            writeText(0,i," ".repeat(width),f,b);
        }
        await bot.flushWrites();
        await sleep(100);
    }
}

async function scrollUp(n){
    for(let y=scrollRegionBot;y>=n+scrollRegionTop;y--){
        for(let x=0;x<width;x++){
            // const char = bot.getChar(x+offsetX,y+offsetY);
            // writeChar(x,y-n,char.char,char.color,char.bgColor);
            const char = visual[y-n][x];
            writeChar(x,y,char[0],char[1],char[2]);
        }
        await bot.flushWrites();
    }
    let [f,b] = invert?[bgcolor,fgcolor]:[fgcolor,bgcolor];
    for(let i=scrollRegionTop;i<scrollRegionTop+n;i++){
        writeText(0,i," ".repeat(width),f,b);
    }
    await bot.flushWrites();
    await sleep(100);
}

function invertColor(c){
    let [r,g,b] = [c>>16,c>>8,c].map(a=>a&255);
    r=255-r;g=255-g;b=255-b;
    return (r<<16)|(g<<8)|b;
}

function drawCursor(show){
    const char = visual[cury][curx];
    let f = char[1];
    let b = char[2];
    // console.log("drawCursor",curx,cury,show,f,b);
    if(show) [f,b] = [b,f];
    writeChar(curx,cury,char[0],f,b,false);
}

async function setCursor(x,y,scroll){ // absolute
    curx=Math.min(Math.max(x,0),width-1);
    if(scroll && y>scrollRegionBot){
        await scrollDown(y-scrollRegionBot);
    }
    if(scroll && y<scrollRegionTop){
        await scrollUp(scrollRegionTop-y);
    }
    cury=Math.min(Math.max(y,0),scrollRegionBot);
    wrapSkip=false;
}

function moveCursor(x,y){ // relative
    curx=Math.min(Math.max(curx+x,0),width-1);
    cury=Math.min(Math.max(cury+y,0),scrollRegionBot);
    wrapSkip=false;
}

async function moveCursorText(n){
    if(n<=0) return;
    if(wrapSkip) n+=1;
    let setWrapSkip = false;
    let newx = (curx+n)%width;
    let newy = cury+Math.floor((curx+n)/width);
    if(newx==0){
        newx=width-1;
        newy-=1;
        setWrapSkip=true;
    }
    await setCursor(newx,newy,true);
    wrapSkip=setWrapSkip;
}

async function drawChar(char){
    if(wrapSkip){
        if(cury+1>scrollRegionBot){
            await scrollDown(cury+1-scrollRegionBot);
            cury=scrollRegionBot-1;
        }
        writeChar(0,cury+1,char,fgcolor,bgcolor);
    } else {
        writeChar(curx,cury,char,fgcolor,bgcolor);
    }
    await moveCursorText(1);
}

async function drawStr(str){
    for(const i in str){
        await drawChar(str[i]);
    }
}

function sleep(n){
    return new Promise(resolve=>{
        setTimeout(resolve,n)
    })
}

async function eraseInDisplay(type){
    let [f,b] = invert?[bgcolor,fgcolor]:[fgcolor,bgcolor];
    if(type==2 || (type==0 && curx==0 && cury==0)){
        for(let i=0;i<height;i++){
            writeText(0,i," ".repeat(width),f,b);
            await bot.flushWrites();
        };
        loopscroll=0;indicateLoopScroll();
        return
    }
    if(type==0){
        writeText(curx,cury," ".repeat(width-curx),f,b);
        for(let i=cury+1;i<height;i++){
            writeText(0,i," ".repeat(width),f,b);
            await bot.flushWrites();
        };
    }
    if(type==1){
        writeText(curx,cury," ".repeat(curx+1),f,b); // NOTE: i'm not sure about that "curx+1"
        for(let i=0;i<cury;i++){
            writeText(0,i," ".repeat(width),f,b);
            await bot.flushWrites();
        };
    }
}

function eraseInLine(type){
    let [f,b] = invert?[bgcolor,fgcolor]:[fgcolor,bgcolor];
    if(type==2) writeText(0,cury," ".repeat(width),f,b);
    if(type==0) writeText(curx,cury," ".repeat(width-curx),f,b);
    if(type==1) writeText(0,cury," ".repeat(curx),f,b);
}

function deviceStatusReport(){
    parentPort.postMessage({type:"streamWrite",str:"\x1b["+(cury+1)+";"+(curx+1)+"R"})
}

function deleteCharacters(n){
    if(n<=0) return;
    for(let x=curx+n;x<width;x++){
        const char = visual[cury][x];
        writeChar(x-n,cury,char[0],char[1],char[2]);
    }
    writeText(width-n,cury," ".repeat(n),fgcolor,bgcolor);
}

async function deleteLines(n){
    for(let y=n+cury;y<=scrollRegionBot;y++){
        for(let x=0;x<width;x++){
            // const char = bot.getChar(x+offsetX,y+offsetY);
            // writeChar(x,y-n,char.char,char.color,char.bgColor);
            const char = visual[y][x];
            writeChar(x,y-n,char[0],char[1],char[2]);
        }
        await bot.flushWrites();
    }
    let [f,b] = invert?[bgcolor,fgcolor]:[fgcolor,bgcolor];
    for(let i=scrollRegionBot+1-n;i<=scrollRegionBot;i++){
        writeText(0,i," ".repeat(width),f,b);
    }
    await bot.flushWrites();
    await sleep(100);
}

async function insertLines(n){
    for(let y=scrollRegionBot;y>=n+cury;y--){
        for(let x=0;x<width;x++){
            // const char = bot.getChar(x+offsetX,y+offsetY);
            // writeChar(x,y-n,char.char,char.color,char.bgColor);
            const char = visual[y-n][x];
            writeChar(x,y,char[0],char[1],char[2]);
        }
        await bot.flushWrites();
    }
    let [f,b] = invert?[bgcolor,fgcolor]:[fgcolor,bgcolor];
    for(let i=cury;i<cury+n;i++){
        writeText(0,i," ".repeat(width),f,b);
    }
    await bot.flushWrites();
    await sleep(100);
}

async function reload(){
    for(let y=0;y<height;y++){
        for(let x=0;x<width;x++){
            const char = visual[y][x];
            writeChar(x,y,char[0],char[1],char[2]);
        }
        await bot.flushWrites();
    }
    if(curVisible) drawCursor(true);
}

async function resetLoopScroll(){
    if(loopscroll==0 || (!loopscrolling)) return;
    loopscroll=0;
    await reload();
    indicateLoopScroll();
}

function setMargin(code){
    scrollRegionTop=Math.max(Math.min(code[0],height)-1,0);
    scrollRegionBot=Math.max(Math.min(code[1],height)-1,0);
    if(scrollRegionBot==0){ scrollRegionBot=height-1; }
    console.log(`set margin to ${scrollRegionTop},${scrollRegionBot} (real=${code.slice(0,2).join(",")})`);
}

function special(type,enable){
    if(type==25){
        curVisible = enable;
    }
    console.error(`special ${enable?"enable":"disable"} ${type}`);
}

async function handleMessage(m){
    // terminal
    const primaryDeviceAttributes="\x1b[?62;1;6c";
    if(m.type=="csi"){
        if(m.special){
            switch(m.final){
                case "l":return special(m.code[0],false);break;
                case "h":return special(m.code[0],true);break;
            }
        }
        if(m.exclamation){
            switch(m.final){
                case "p": // NOTE: if cursor show/hide is used, or anything in https://vt100.net/docs/vt510-rm/DECSTR.html, then implement it here
                    scrollRegionTop=0;
                    scrollRegionBot=height-1;
                    fgcolor=defaultfg;
                    bgcolor=defaultbg;
                    invert=false;
                    return; break;
            }
        }
        switch(m.final){
            case "A": v=Math.max(m.code[0],1); moveCursor( 0,-v);break;
            case "B": v=Math.max(m.code[0],1); moveCursor( 0, v);break;
            case "C": v=Math.max(m.code[0],1); moveCursor( v, 0);break;
            case "D": v=Math.max(m.code[0],1); moveCursor(-v, 0);break;
            case "E": setCursor(0,cury+Math.max(m.code[0],1),false);break;
            case "F": setCursor(0,cury-Math.max(m.code[0],1),false);break;
            case "G": setCursor(m.code[0]-1,cury,false);break;
            case "H": case "f": await setCursor(m.code[1]-1,m.code[0]-1);break;
            case "J": eraseInDisplay(m.code[0]);break;
            case "K": eraseInLine(m.code[0]);break;
            case "L": await insertLines(Math.max(m.code[0],1));break;
            case "M": await deleteLines(Math.max(m.code[0],1));break;
            case "P": deleteCharacters(m.code[0]);break;
            case "S": await scrollDown(Math.max(m.code[0],1));break;
            case "T": await scrollUp(Math.max(m.code[0],1));break;
            case "X": writeText(curx,cury," ".repeat(Math.max(m.code[0],1)),fgcolor,bgcolor);break;
            case "c": parentPort.postMessage({type:"streamWrite",str:primaryDeviceAttributes});break;
            case "d": setCursor(curx,m.code[0]-1,false);break;
            case "m": sgr(m.code,[invert,fgcolor,bgcolor,a=>{fgcolor=a??defaultfg},a=>{bgcolor=a??defaultbg},a=>{invert=a}]);break;
            case "n": if(m.code[0]==6){deviceStatusReport();};break;
            case "r": setMargin(m.code);break;
            // TODO: implement alternative buffer
            // TODO: implement "p" (?)
            default:console.error("CSI final char. '"+m.final+"' not supported (code: "+m.code.join(",")+", s="+m.special+")");break;
        }
    }
    if(m.type=="newline"){
        // await setCursor(0,cury+1,true);
        await setCursor(curx,cury+1,true);
    }
    if(m.type=="newlinerev"){
        await setCursor(curx,cury-1,true);
    }
    if(m.type=="return"){
        setCursor(0,cury,false);
    }
    if(m.type=="char"){
        await drawChar(m.char);
    }
    if(m.type=="str"){
        await drawStr(m.str);
    }
    if(m.type=="backspace"){
        moveCursor(-1,0);
    }
    if(m.type=="savecur"){
        curxSave = curx;
        curySave = cury;
    }
    if(m.type=="restorecur"){
        curx = curxSave;
        cury = curySave;
    }
    if(m.type=="status"){
        console.log(m.args)
        if(m.args.includes("type==shell")){
            await resetLoopScroll();
        }
    }
}

// message queue system so that it doesn't desync

async function onConnect(){
    console.log("connected!");
    await setCursor(0,0,false);
    // writeText(0,-1,"OWOTerm [WIP]");
    for(let i=0;i<height;i++){
        writeText(0,i," ".repeat(width),fgcolor,bgcolor);
        await bot.flushWrites();
    }
    if(loopscrolling) indicateLoopScroll();
    await input.init([bot,parentPort,writeChar,writeText,offsetX,offsetY,width,height,reload]);
    parentPort.postMessage({type:"ready"});
    let cursorShown = false;
    while(true){
        if(messageQueue.length>0){
            if(cursorShown){
                drawCursor(false);
                cursorShown=false;
                await bot.flushWrites();
            }
            await handleMessage(messageQueue[0]);
            messageQueue.shift();
            lastMessageTimestamp = Date.now();
        } else {
            if(!cursorShown && curVisible){
                drawCursor(true);
                cursorShown=true;
            }
            if(lastMessageTimestamp+loopscrollResetTimeout<Date.now()){
                await resetLoopScroll();
            }
            await sleep(100);
        }
        // console.error(messageQueue.length,cursorShown);
    }
}

let messageQueue = [];

parentPort.on("message",async (m)=>{
    if(m.type=="settings"){
        ({world,width,height,offsetX,offsetY,loopscrolling,loopscrollResetTimeout,defaultbg,defaultfg} = m.settings); // WHYYYYYY??????!!§??§???!§§???????
        input.settings(m.settings);
        visual = [...new Array(height)].map(a=>
            [...new Array(width)].map(a=>
                [" ",fgcolor,bgcolor]
            )
        );
        scrollRegionBot = height-1;
        bgcolor = defaultbg;
        fgcolor = defaultfg;
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
    } else {
        messageQueue.push(m);
    }
})

let lastMessageTimestamp = Date.now();
