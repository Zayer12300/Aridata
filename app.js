
function log(msg){
    const box = document.getElementById("log");
    box.textContent += msg + "\n";
}

function showTab(name){
    document.getElementById("headers").style.display = "none";
    document.getElementById("items").style.display = "none";
    document.getElementById(name).style.display = "block";
}

function runHeaders(){

    const file = document.getElementById("headersFile").files[0];
    if(!file){
        alert("Select CSV");
        return;
    }

    const reader = new FileReader();

    reader.onload = function(e){

        log("Parsing CSV...");

        const result = Papa.parse(e.target.result,{
            header:true
        });

        const rows = result.data;

        const csv = Papa.unparse(rows);

        const blob = new Blob([csv],{type:"text/csv"});
        const url = URL.createObjectURL(blob);

        const link = document.getElementById("headersDownload");
        link.href = url;
        link.innerText = "Download Contracts.csv";

        log("Contracts.csv ready");
    };

    reader.readAsText(file);
}

async function runItems(){

    const file = document.getElementById("itemsFile").files[0];
    if(!file){
        alert("Select file");
        return;
    }

    const text = await file.text();

    let rows;

    if(file.name.endsWith(".json")){
        try {
            const parsed = JSON.parse(text);
            if(!Array.isArray(parsed)) throw new Error("JSON root must be an array");
            rows = parsed;
        } catch(e) {
            alert("Invalid JSON file: " + e.message);
            return;
        }
    }else{
        rows = Papa.parse(text,{header:true}).data;
    }

    log("Grouping contracts...");

    const map = {};

    rows.forEach(r=>{
        const id = r.contract_id || r.contractid || "UNKNOWN";
        if(!map[id]) map[id]=[];
        map[id].push(r);
    });

    const zip = new JSZip();

    for(const cid in map){

        const sheet = XLSX.utils.json_to_sheet(map[cid]);
        const wb = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(wb,sheet,"Contract Item Information");

        const data = XLSX.write(wb,{type:"array",bookType:"xlsx"});

        zip.file("LC"+cid+".xlsx",data);
    }

    const blob = await zip.generateAsync({type:"blob"});

    const url = URL.createObjectURL(blob);

    const link = document.getElementById("itemsDownload");
    link.href = url;
    link.innerText = "Download ZIP";

    log("ZIP ready");
}
