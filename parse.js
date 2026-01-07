module.exports = async function(read,postMessage){
    const char = await read(1);

    if(char=="\x1b"){
        const header = await read(1);
        if(header=="["){
            let code=""
            let final=""
            while((code.at(-1)??" ").charCodeAt(0)<0x40){
                code=code+(await read(1));
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
            postMessage({type:"csi",final,code,special,exclamation});
        } else if(header=="]"){
            let code=""
            while(code.slice(-2)!="\x1b\\" && (code.at(-1)??" ")!="\x07" && (code.at(-1)??" ")!="\x9C"){
                code=code+(await read(1));
            }
            if(code.slice(-2)=="\x1b\\"){
                code=code.slice(0,-2);
            } else {
                code=code.slice(0,-1);
            }
            let operation=parseInt(code.split("\x07")[0]);
            // console.error(`ANSI OSC: ${JSON.stringify(code)}, type ${type}`)
            postMessage({type:"osc",operation,code});
        } else if(header=="P"){
            let code=""
            while(code.slice(-2)!="\x1b\\" && (code.at(-1)??" ")!="\x9C"){
                code=code+(await read(1));
            }
            // console.error(`ANSI DCS: ${JSON.stringify(code)}`)
        } else if(header=="("){
            // i don't know any program that uses anything else than UTF-8 or ASCII on the terminal
            await read(1);
        } else if(header=="D"){
            postMessage({type:"newline"});
        } else if(header=="M"){
            postMessage({type:"newlinerev"})
        } else if(header==">"){
            // DECKPNM (basically turns on numlock)
            // since all input methods will use actual digits, this gets ignored
        } else if(header=="="){
            // DECKPAM (maybe also turns on numlock?)
            // again, this gets ignored
        } else if(header=="7"){
            postMessage({type:"savecur"});
        } else if(header=="8"){
            postMessage({type:"restorecur"});
        } else {
            console.error("Unknown ANSI code header: \\x1b\\x"+header.charCodeAt().toString(16).padStart(2,"0"));
            const str="[UNK-"+header.charCodeAt().toString(16).padStart(2,"0")+"]";
            // postMessage({type:"str",str})
        }
    } else if(char=="\n"){
        postMessage({type:"newline"});
    } else if(char=="\r"){
        postMessage({type:"return"});
    } else if(char=="\t"){
        postMessage({type:"tab"});
    } else if(char=="\x08"){
        postMessage({type:"backspace"});
    } else if(char.charCodeAt()<32){
        if(char!="\x0f"){
            console.error("Unknown special ANSI character (\\x"+char.charCodeAt().toString(16).padStart(2,"0")+")")
        }
    } else {
        // TODO: fix bug that somehow makes both fgcolor and bgcolor white (including cleaning code)
        postMessage({type:"char",char});
    }
}
