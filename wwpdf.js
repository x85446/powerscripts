#!/usr/bin/env node

/**
 https://github.com/jjwilly16/node-pdftk
https://github.com/NickNaso/ghostscript4js

*/

const program = require('commander');
const jsonminify=require('jsonminify');
const fs=require('fs');
const path=require('path');
const gs = require('ghostscript4js');
const pdftk = require('node-pdftk');
const mkdirp=require('mkdirp');
const each=require('sync-each');
var execSync = require('child_process').execSync;
var winston = require('winston');
const moment=require('moment');

program
.version('0.1.0')
.option('-s, --schema [schema]', 'specify a specific schema [default is all schemas]')
.option('-c, --crawl', 'crawl all subdirectories and run all pdf.json')
.option('-l, --loglevel [level]','set the log level [error, warn, info, verbose, debug, silly]','info')
.option('-t, --timestamp [true|false]','use timestamps in logs',false)
.parse(process.argv);

const myConsoleFormat = winston.format.printf(function (info) {
	if(program.timestamp){
	  return `${info.level} [${moment().format('YYYY-MM-DDTHH:mm:ss.SSSZZ')}]: ${info.message}  `;
	}
	else return `${info.level}: ${info.message}`;
});
var logger = winston.createLogger({
    transports: [
      new winston.transports.Console({ format: winston.format.combine( winston.format.colorize(), myConsoleFormat)  })
    ],
    level: program.loglevel,
  });



const writeAbookmarkToFD = (fd,title,level,page,offset)=>{
	fs.writeSync(fd,"BookmarkBegin\n");
	fs.writeSync(fd,"BookmarkTitle: "+title+"\n");
	fs.writeSync(fd,"BookmarkLevel: "+level+"\n");
	fs.writeSync(fd,"BookmarkPageNumber: "+(page+offset+"\n"));
}
const writeAbookmarkToRay = (ray,title,level,page,offset)=>{
	ray.push("BookmarkBegin");
	ray.push("BookmarkTitle: "+title);
	ray.push("BookmarkLevel: "+level);
	ray.push("BookmarkPageNumber: "+(page+offset));
	return ray;
}

const loopTOC = (obj,clevel,offset,fd) => {
	Object.entries(obj).forEach(([key, val]) => {
		if (val && typeof val === 'object') {
			loopTOC(val,(clevel+1),offset,fd);
		}
		else {
			writeAbookmarkToFD(fd,key,clevel,val,offset);
		// 	fs.writeSync(fd,"BookmarkBegin\n");
		// 	fs.writeSync(fd,"BookmarkTitle: "+key+"\n");
		// 	fs.writeSync(fd,"BookmarkLevel: "+clevel+"\n");
		// 	fs.writeSync(fd,"BookmarkPageNumber: "+(val+offset+"\n"));
	}
});
};

const buildBookmarkFile = (outfile,TOC) => {
	fd=fs.openSync(outfile,'w');
	loopTOC(TOC,1,0,fd);
	fs.closeSync(fd);
}


const getMetaData=(PDF,outfile) => {
	let metadata;
	var exe="pdftk "+PDF+" data_dump output "+outfile+";cat "+outfile
	_debug(exe);
	metadata=execSync(exe);
	metaRay=metadata.toString().split(/(?:\r\n|\r|\n)/g);
	return metaRay;
}

const getBookmarks=(metadataArray) => {
	let bRay=[];
	for (var lineno = 0; lineno < metadataArray.length; lineno++) {
		var str = metadataArray[lineno];
		if(str.startsWith("Book")){
			bRay.push(str);
		}
	}
	return bRay;
}





const buildPdfList=(obj) => {
	var rtnstring="";
	var rtnkeys="";
	Object.entries(obj).forEach(([key, val]) => {

		rtnstring+=key+"=\""+val+"\" ";
		rtnkeys+=key+" ";
	});
	return {"pdflist":rtnstring,"po":rtnkeys}
}

const updateJustBookmarks=(metadatafile,newbookmarkfile) => {
	var exe="pdftk "+outtemp+" data_dump output"
	_debug(exe);
	books=execSync(exe);
}

const replaceBookmarksInMetaFile=(metaDataRay,bookRay,newfile) =>{

	let firsttime=true;
	let bline;
	let rRay=[];
	outfd=fs.openSync(newfile,'w');
	for (var lineno = 0; lineno < metaDataRay.length; lineno++) {
		line=metaDataRay[lineno];
		if(line.startsWith("Book")){
			if(firsttime){
				for (var blineno = 0; blineno < bookRay.length; blineno++) {
					bline=bookRay[blineno];
					fs.writeSync(outfd,bline+"\n");
					rRay.push(bline);
					_debug("PUSHING -->"+bline);
				}
				firsttime=false;
			}
		}
		else {
			fs.writeSync(outfd,line+"\n");
			rRay.push(line);
		}
	}
	return rRay;
}








const insertBookmarkTopLevel=(title,bookMarkRay,newbookmarkfile) => {
	var bRay=[];
	var books=""
	var booklines="";
	let regex = /^(BookmarkLevel:\s)+(\d)+/g;
	let m;
	let matched=false;
	let theinc=0;
	tbfd=fs.openSync(newbookmarkfile,'w');
	writeAbookmarkToFD(tbfd,title,1,1,0);
	writeAbookmarkToRay(bRay,title,1,1,0);
	for (var line = 0; line < bookMarkRay.length; line++) {
		var str = bookMarkRay[line];
		regex.lastIndex=0;
		_debug("my line: '"+str+"'");
		matched=false;
		while ((m = regex.exec(str)) !== null) {
			if (m.index === regex.lastIndex) {
				regex.lastIndex++;
			}
			matched=true;
			_debug("in here");
			_debugDir(m);
			theinc=parseInt((m[2]));
			_debug("my inc: "+theinc+"vs the m2: "+m[2]);
			theinc++;
			_debug("my inc: "+theinc+"vs the m2: "+m[2]);
			fs.writeSync(tbfd,m[1]+theinc+"\n");
			bRay.push(m[1]+theinc);
			// m.forEach((match, groupIndex) => {
			// 	_debug(`Found match, group ${groupIndex}: ${match}`);
			// });
		}
		if (! matched){
			fs.writeSync(tbfd,str+"\n");
			bRay.push(str);
		}
	}
	fs.closeSync(tbfd);
	return bRay;
}



const toplevelBookmarks=(text,outtemp,bmkfile)=> {
	var books=""
	var booklines="";
	let regex = /^(BookmarkLevel:\s)+(\d)+/g;
	let m;
	let matched=false;
	let theinc=0;
	var exe="pdftk "+outtemp+" data_dump output | grep Book"
	_debug(exe);
	books=execSync(exe);
	booklines=books.toString().split(/(?:\r\n|\r|\n)/g);
	tbfd=fs.openSync(bmkfile,'w');
	writeAbookmarkToFD(tbfd,text,1,1,0);
	for (var line = 0; line < booklines.length; line++) {
		var str = booklines[line];
		regex.lastIndex=0;
		_debug("my line: '"+str+"'");
		matched=false;
		while ((m = regex.exec(str)) !== null) {
			if (m.index === regex.lastIndex) {
				regex.lastIndex++;
			}
			matched=true;
			_debug("in here");
			_debugDir(m);
			theinc=parseInt((m[2]));
			_debug("my inc: "+theinc+"vs the m2: "+m[2]);
			theinc++;
			_debug("my inc: "+theinc+"vs the m2: "+m[2]);
			fs.writeSync(tbfd,m[1]+theinc+"\n");
			// m.forEach((match, groupIndex) => {
			// 	_debug(`Found match, group ${groupIndex}: ${match}`);
			// });
		}
		if (! matched){
			fs.writeSync(tbfd,str+"\n");
		}
	}
	fs.closeSync(tbfd);
}

const _showRay=(rayname,ray)=>{
	_debug("----")
	_debug(rayname);
	_debugDir(ray);
}

const _debug=(message) => {
	if(program.debug){
		console.log(message);
	}
}

const _debugDir=(message) => {
	if(program.debug){
		console.dir(message);
	}
}
// let asyncForEach = (array, callback) => {
// 	let result=(async function() { 
// 		for (let index = 0; index < array.length; index++) {
// 			await callback(array[index], index, array)
// 		}
// 	})();

const processSchema = (schema) => {
		var counter=0;
		schema.pdfs.forEach(function(element) {
			counter++;
			logger.log
			logger.info("building: "+element.outPDF);
			mkdirp.sync(path.dirname(path.resolve(element.outPDF)));
			var outtemp="/tmp/out_"+counter+".pdf";
			var booktemp="/tmp/bmk"+counter+".txt";
			if (element.inpdfs){
				var inpdfOBJ=buildPdfList(element.inpdfs);
				pdflist=inpdfOBJ.pdflist;
				po=inpdfOBJ.po;
				_debug("MY PO: "+po);
			}
			else if(element.wildcard){
				var pdflist=element.wildcard;
				po="";
			}
			if (element.pageOrder){
				po=element.pageOrder;
			}
			var exe="pdftk "+pdflist+" cat "+po+" output "+outtemp
			_debug(exe);
			execSync(exe);

		//	}
			// else { 
			// 	fs.copyFileSync(element.inpdfs.A,outtemp);
			// }
			if (element.TOC){
				buildBookmarkFile(booktemp,element.TOC);
				var exe="/usr/local/bin/pdftk "+outtemp+" update_Info "+booktemp+" output "+element.outPDF
				_debug(exe);
				execSync(exe);
			}
			else if (element.TOC_TOPLEVEL){
				var oldMetaRay=getMetaData(outtemp,"/tmp/mdfile.txt");
				var oldBooksRay=getBookmarks(oldMetaRay);
				var newBooksRay=insertBookmarkTopLevel(element.TOC_TOPLEVEL,oldBooksRay,"/tmp/bktmp.txt");
				var newMetaRay=replaceBookmarksInMetaFile(oldMetaRay,newBooksRay,"/tmp/newmdfile.txt");
				_debug("-------------------------");
				_showRay("metaold",oldMetaRay);
				_showRay("bookold",oldBooksRay);
				_showRay("newbook", newBooksRay);
				_showRay("newmeta",newMetaRay);
				var exe="pdftk "+outtemp+" update_Info /tmp/newmdfile.txt output "+element.outPDF
				_debug(exe);
				execSync(exe);
			}
			else {
				fs.copyFileSync(outtemp,element.outPDF);
			}
		});

}


const start=()=>{
	if (program.schema){
	processSchema(desc[program.schema]);
		}
		else {
			for (var schema in desc){
				processSchema(desc[schema]);
			}
		}
	_debug("all done with start");
}




desc = JSON.parse(jsonminify(fs.readFileSync(program.args[0], 'utf8')));
froot=path.dirname(path.resolve(program.args[0]));
process.chdir(froot);
//_debug(froot);
//process.exit(0);
 //_debug(desc);
logger.log({
  level: 'info',
  message: 'Starting pdfpower parsing: '+program.args[0]
});

logger.log({
  level: 'debug',
  message: 'Hello debug distributed log files!'
});



 start();




// try {
//   // Take decision based on Ghostscript version
//   const version = gs.version()
//   _debug(version)
//  // gs.executeSync('-sDEVICE=pngalpha -o my.png -sDEVICE=pngalpha -r144 my.pdf')
// } catch (err) {
//   // Handle error
//   throw err
// }