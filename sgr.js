const darkColors = [0x010101,0xde382b,0x39b54a,0xffc706,0x006fb8,0x762671,0x2cb5e9,0xcccccc];
const brightColors = [0x808080,0xff0000,0x00ff00,0xffff00,0x0000ff,0xff00ff,0x00ffff,0xffffff];
let eightBitColors = darkColors.concat(brightColors);
for(let i=0;i<216;i++){
    const r=Math.floor(Math.floor(i/36)*255/5)
    const g=Math.floor(Math.floor(i/6%6)*255/5)
    const b=Math.floor(Math.floor(i%6)*255/5)
    eightBitColors.push((r<<16)|(g<<8)|b);
}
for(let i=0;i<24;i++){
    const l=Math.floor((i+1)/25*255);
    eightBitColors.push(l*0x10101)
}
// console.log(eightBitColors.map(a=>a.toString(16).padStart(6,"0")).join("  "))

function handle(args,props){
    let [invert,fgcolor,bgcolor,setfgcolor,setbgcolor,setinvert] = props;

    if(args.length<1) return;

    // console.error(`ANSI SGR ${args.join(",")}`)

    if(invert){
        [fgcolor,bgcolor,setfgcolor,setbgcolor] = [bgcolor,fgcolor,setbgcolor,setfgcolor]
    }

    // resetting
    if(args[0]==0){
        setinvert(false);
        setfgcolor(null);
        setbgcolor(null);
        return handle(args.slice(1),props);
    }
    if(args[0]==27){
        if(invert){
            setinvert(false);
            setfgcolor(bgcolor);
            setbgcolor(fgcolor);
        }
        return handle(args.slice(1),props);
    }
    if(args[0]==39){ setfgcolor(null);return handle(args.slice(1),props); }
    if(args[0]==49){ setbgcolor(null);return handle(args.slice(1),props); }

    // 4-bit color
    if(args[0]>=30 && args[0]<=37){ setfgcolor(darkColors[args[0]-30]);return handle(args.slice(1),props); }
    if(args[0]>=40 && args[0]<=47){ setbgcolor(darkColors[args[0]-40]);return handle(args.slice(1),props); }
    if(args[0]>=90 && args[0]<=97){ setfgcolor(brightColors[args[0]-90]);return handle(args.slice(1),props); }
    if(args[0]>=100 && args[0]<=107){ setbgcolor(brightColors[args[0]-100]);return handle(args.slice(1),props); }

    // 8-bit color
    if(args[0]==38 && args[1]==5){ setfgcolor(eightBitColors[args[2]]);return handle(args.slice(3),props); }
    if(args[0]==48 && args[1]==5){ setbgcolor(eightBitColors[args[2]]);return handle(args.slice(3),props); }

    // 24-bit color
    if(args[0]==38 && args[1]==2){ setfgcolor(args[2]<<16|args[3]<<8|args[4]);return handle(args.slice(5),props); }
    if(args[0]==48 && args[1]==2){ setbgcolor(args[2]<<16|args[3]<<8|args[4]);return handle(args.slice(5),props); }

    // invert colors
    if(args[0]==7){
        if(!invert){
            setfgcolor(bgcolor);
            setbgcolor(fgcolor);
            setinvert(true);
        }
        return handle(args.slice(1),props);
    }

    return handle(args.slice(1),props);
}

module.exports = handle;
