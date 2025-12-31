let bot,parentPort,writeChar,writeText,offsetX,offsetY,width,height,reload;
let hardResetCooldownStamp = Date.now();
let softResetCooldownStamp = Date.now();
let hardResetCooldown;
let softResetCooldown;
let displayName = "OWOTerm";
let chatColor = "#000000";

function chat(msg,type){
    return bot.chat(msg,undefined,displayName,chatColor);
}

const noQMPMessage = `I can't find the QMP port for interacting with QEMU! Can you ask the host to do this for me?
- Add a QMP (TCP) port to the QEMU command line flags (e.g. -qmp tcp:localhost:4444,server,wait=off)
- Change the value of "qmpPort" to the port number inside of my settings file

But for now, I can't hard reset, or soft reset the virtual machine... (╯°□°)╯︵ ┻━┻`;

function streamWrite(str){
    parentPort.postMessage({type:"streamWrite",str});
}

function hardReset(){
    if(!qmpPort) return chat(noQMPMessage);
    if(hardResetCooldownStamp+hardResetCooldown>Date.now()){
        chat(`Please wait ${Math.floor((hardResetCooldownStamp+hardResetCooldown-Date.now())/1000)} seconds before hard resetting the virtual machine.`)
    } else {
        hardResetCooldownStamp=Date.now();
        parentPort.postMessage({type:"hardReset"});
    }
}

function softReset(){
    if(!qmpPort) return chat(noQMPMessage);
    if(softResetCooldownStamp+softResetCooldown>Date.now()){
        chat(`Please wait ${Math.floor((softResetCooldownStamp+softResetCooldown-Date.now())/1000)} seconds before soft resetting the virtual machine.`)
    } else {
        hardResetCooldownStamp=Date.now();
        parentPort.postMessage({type:"softReset"});
    }
}

function chatMessage(e){
    /*
     * e = {
     *  id: 9005,
     *  nickname: 'Ponali',
     *  realUsername: 'Ponali',
     *  registered: true,
     *  op: false,
     *  admin: false,
     *  staff: false,
     *  location: 'page',
     *  message: 'test',
     *  color: '#000000',
     *  date: 1766386029730,
     *  customMeta: undefined,
     *  rankName: undefined,
     *  rankColor: undefined
     * } */
    if(e.message.startsWith("term:")){
        let command = e.message.slice(5).split(" ");
        if(command[0]=="c"){
            if(command[1]){
                streamWrite(String.fromCharCode(command[1].toUpperCase().charCodeAt()-64))
            } else {
                streamWrite("\x03");
            }
            return;
        }
        if(command[0]=="r"||command[0]=="run") return streamWrite(command.slice(1).join(" ")+"\r");
        if(command[0]=="t"||command[0]=="type"||command[0]=="w"||command[0]=="write") return streamWrite(command.slice(1).join(" "));
        if(command[0]=="s"||command[0]=="string"){
            let string;
            try{
                string = JSON.parse(command.slice(1).join(" ")).toString();
            } catch (e) {
                chat(`I can't understand what you just said - is it valid JSON?\n${e.message}`)
            }
            if(string!==undefined) streamWrite(string);
            return;
        }

        if(command[0]=="^") return streamWrite("\x1b[A".repeat(command[1]??1))
        if(command[0]=="v") return streamWrite("\x1b[B".repeat(command[1]??1))
        if(command[0]==">") return streamWrite("\x1b[C".repeat(command[1]??1))
        if(command[0]=="<") return streamWrite("\x1b[D".repeat(command[1]??1))
        if(command[0]=="b" || command[0]=="backspace") return streamWrite("\x08".repeat(command[1]??1));
        if(command[0]=="d" || command[0]=="delete") return streamWrite("\x1b[3~".repeat(command[1]??1));
        if(command[0]=="e" || command[0]=="enter") return streamWrite("\r");
        if(command[0]=="es") return streamWrite(`\x1b`)
        if(command[0]=="f"||command[0][0]=="f"){
            let num = parseInt(command[0]=="f"?command[1]:command[0].slice(1));
            if(num<1 || num>12){
                return bot.chat("I don't know how to send that function key. Can you try one from F1 through F12 instead?");
            }
            if(num<=4){
                streamWrite("\x1bO"+String.fromCharCode(79+num));
            } else if(num==5){
                streamWrite("\x1b[15~");
            } else if(num<=10) {
                streamWrite("\x1b["+(11+num)+"~");
            } else if(num>10) {
                streamWrite("\x1b["+(12+num)+"~");
            }
            return;
        }
        if(command[0]=="p^" || command[0]=="pu") return streamWrite("\x1b[5~".repeat(command[1]??1));
        if(command[0]=="pv" || command[0]=="pd") return streamWrite("\x1b[6~".repeat(command[1]??1));
        if(command[0]=="t" || command[0]=="tab") return streamWrite("\t");

        if(command[0]=="hrs") return hardReset();
        if(command[0]=="rs" || command[0]=="srs" || command[0]=="reset") return softReset();

        if(command[0]=="h"||command[0]=="help"){
            bot.chat(`Usage: term:CMD [args]
Writing text to terminal:
- r, run: Send text then press Enter
- t, type, w, write: Send text without pressing Enter
- s, string: Send raw data using string parsable by JSON`)
            bot.chat(`Sending keys to terminal:
- ^, <, v, >: Send arrow key ("term:>" = move right, "term:^ 2" = move up twice)
- b, backspace: Send Backspace (repeatable)
- c, ctrl: Press a letter with ctrl. Defaults to Ctrl+C.
- e, enter: Press Enter.
- es, escape: Press Escape.
- f, f#: Press a function key (F1 through F12)
- pu, pd, p^, pv: Send Page Up or Page Down (repeatable)
- t, tab: Press Tab.`)
            if(qmpPort) bot.chat(`Controlling the virtual machine:
- hrs: Hard reset
- rs, srs, reset: Soft reset`)
            bot.chat(`Misc.:
- h, help: Show this message.
- rl, reload: Reload the terminal`)
            return;
        }
        if(command[0]=="rl" || command[0]=="reload"){
            return reload().then(()=>{
                bot.chat("Successfully reloaded the terminal.")
            });
        }

        chat("What does term:"+command[0]+" mean...?\n> For help, send \"term:h\".");
    }
}

function drawTextArea(){
    const title = "┤ Text input ├";
    writeText(0,height+1,"╭"+"─".repeat(width-2-title.length)+title+"╮");
    writeText(0,height+2,"│"+" ".repeat(width-2)+"│");
    writeText(0,height+3,"╰"+"─".repeat(width-2)+"╯");
}

function drawPowerButton(type){
    switch(type){
        case 0:if(qmpPort) writeText(0,height+4,"⏻ Hard Reset",0x000060,0xaaaaaa);break;
        case 1:if(qmpPort) writeText(13,height+4,"↻ Soft Reset",0x000000,0xaaaaaa);break;
    }
}

async function getTextInputValue(length){
    const [x1,y1,x2,y2] = [offsetX,offsetY+height,offsetX+width,offsetY+height+4];
    // console.log("fetching tiles")
    await bot.fetchTiles(
        Math.floor(x1/16),Math.floor(y1/8),
        Math.floor(x2/16),Math.floor(y2/8)
    );
    // console.log("getting chars")
    let str="";
    for(let i=0;i<(length||(width-2));i++){
        // console.log(`cx=${offsetX+i+1},cy=${offsetY+height+2}`)
        const char = bot.getChar(offsetX+i+1,offsetY+height+2)??({char:"?"});
        // console.log(char);
        str = str+(char.char??"?");
    }
    if(length==undefined){
        // console.log("removing spaces")
        while(str.at(-1)==" " && str.length>0) str=str.slice(0,-1);
    }
    return str;
}

function cursorMove(channelID,hidden,x,y){
    if(hidden||typeof(x)!="number"||typeof(y)!="number") return;
    x-=offsetX;y-=offsetY;
    if(y==height+3 && x>=1 && x<=width-1){
        getTextInputValue(x==1?undefined:(x-1)).then(str=>{
            if(x==1) str=str+"\n"
            parentPort.postMessage({type:"streamWrite",str});
            drawTextArea();
        })
    }
    if(y==height+2 && x==width-1){
        getTextInputValue(width-2).then(str=>{
            parentPort.postMessage({type:"streamWrite",str});
            drawTextArea();
        })
    }
}

// area that events will be focused on, basically everything outside the actual terminal
let cx1,cy1,cx2,cy2;
let tx1,ty1,tx2,ty2;

let oldChars = {};

function onCharChange(x,y,c,fg,bg){
    // console.log(`char change pos=${x},${y} c='${c}' fg=${fg.toString(16).padStart(6,"0")} bg=${bg.toString(16).padStart(6,"0")}`);
    if(y==height+4 && x>=0 && x<12){
        hardReset(); drawPowerButton(0);
    }
    if(y==height+4 && x>=13 && x<25){
        softReset(); drawPowerButton(1);
    }
}

function onTileUpdate(e){
    // TODO: make it only check the tiles that are present on the recieved event, not all the characters in the region
    for(let y=cy1;y<cy2;y++){
        for(let x=cx1;x<cx2;x++){
            const char = bot.getChar(x,y)??{char:" ",color:0,bgColor:-1};
            const oldChar = oldChars[`${x};${y}`];
            if(char.char!=oldChar.char || char.color!=oldChar.color || char.bgColor!=oldChar.bgColor){
                // console.log("DIFF",x,y,char,oldChar);
                oldChars[`${x};${y}`]=char;
                onCharChange(x-offsetX,y-offsetY,char.char,char.color,char.bgColor);
            }
        }
    }
}

async function init(properties){
    [bot,parentPort,writeChar,writeText,offsetX,offsetY,width,height,reload] = properties;

    // init chatbot
    bot.on("chat",chatMessage);

    // set tile region
    [cx1,cy1,cx2,cy2] = [offsetX,offsetY+height,offsetX+width,offsetY+height+8];
    [tx1,ty1,tx2,ty2] = [
        Math.floor(cx1/16),Math.floor(cy1/8),
        Math.floor(cx2/16),Math.floor(cy2/8)
    ]
    // console.error(`chars: ${cx1},${cy1} -> ${cx2},${cy2}`);

    // init text input
    drawTextArea();
    bot.on("guestCursor",cursorMove);

    // init power buttons
    for(let i=0;i<2;i++){
        drawPowerButton(i);
    }

    // init tile updating
    bot.setBoundary(tx1,ty1,tx2,ty2);
    await bot.fetchTiles(tx1,ty1,tx2,ty2);
    for(let y=cy1;y<cy2;y++){
        for(let x=cx1;x<cx2;x++){
            oldChars[`${x};${y}`] = bot.getChar(x,y)??{char:" ",color:0,bgColor:-1};
        }
    }
    bot.receiveTileUpdates(true);
    bot.on("tileUpdate",onTileUpdate);
}

function flagCharUpdated(x,y,c,fg,bg){
    if(x<cx1 || y<cy1 || x>cx2 || y>cy2) return;
    if(isNaN(x)||isNaN(y)) return;
    fg = fg??0;
    bg = bg??-1;
    bg = -1; // NOTE: the library can't detect background colors for some reason. whenever it does, remove this line
    // console.log(`flagcharupdated ${x-offsetX},${y-offsetY} (real=${x},${y}) '${c}' ${fg} ${bg}`);
    oldChars[`${x};${y}`] = {char:c,color:fg,bgColor:bg};
}

function settings(s){
    ({hardResetCooldown,softResetCooldown,qmpPort,displayName,chatColor} = s); // why?????????
}

module.exports = {
    init,flagCharUpdated,settings
}
