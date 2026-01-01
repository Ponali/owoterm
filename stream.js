let runExec,qmpPort;

const {spawn,exec} = require('child_process');
const net = require('net'); // QMP
let child;
let buffer = "";
let waitingRead = null;
let crashed = false;

function addToBuffer(data){
    buffer=buffer+data;
    if(typeof(waitingRead)=="function"){
        waitingRead();
    }
}

function spawnChild(){
    child = spawn(runExec, [], {detached:true});
    child.stdout.setEncoding("utf8");
    child.stdout.on("data",data=>{
        // console.log(`recieved ${data.length} chars of data`)
        addToBuffer(data)
    })
    child.stderr.setEncoding("utf8");
    child.stderr.on("data",data=>{
        console.log("STDERR: "+data)
        addToBuffer(data.replaceAll("\n","\r\n"));
    })

    child.on("close",(code,signal)=>{
        console.log("close signal");
        onChildClose(code,signal);
    })
}

function onChildClose(code,signal){
    if(code==null){
        addToBuffer("\r\n\x1b[0;33mQEMU VM instance has been killed. (signal "+signal+")\x1b[0m\r\n")
        setTimeout(()=>{
            spawnChild();
        },2000)
    } else if (typeof(code)=="number" && code>0){
        addToBuffer("\r\n\x1b[0;33mQEMU VM instance has crashed. (code "+code+")\r\n")
        crashed = true;
    } else {
        spawnChild();
    }
}

function read(n){
    return new Promise(resolve=>{
        function attemptResolve(){
            if(buffer.length>=n){
                const data = buffer.slice(0,n);
                buffer=buffer.slice(n);
                resolve(data);
            }
        }
        attemptResolve();
        waitingRead=attemptResolve;
    })
}

function unshift(str){
    buffer=str+buffer;
}

function hardReset(){
    exec(`bash -c "kill -s SIGINT $(lsof -t -i TCP:${qmpPort})"`,err=>{
        if(err){
            console.error(`Error when hard resetting: ${err}`)
        }
    });
}

function softReset(){
    const client = net.createConnection({port: qmpPort},()=>{
        client.write(JSON.stringify({"execute":"qmp_capabilities"}));
        client.write(JSON.stringify({"execute":"system_powerdown"}));
    });
    client.setEncoding("utf-8");
    client.on("data",data=>{
        // console.log(`SR: Server returned: ${data}`)
    })
    client.on("error",err=>{
        console.log("SR: Error connecting:",err)
    })
    client.on("end",()=>{
        // console.log("SR: Server closed session.")
    })
}

function quit(){
    return new Promise(resolve=>{
        if(crashed) return resolve();
        onChildClose = resolve;
        softReset();
    })
}

module.exports = function(s){
    ({runExec,qmpPort} = s); // why...
    spawnChild();
    return {
        read,
        write:(data)=>{child.stdin.write(data);},
        hardReset,softReset,quit
    };
}
