'use strict';
const {inspectLegacyDirectory}=require('../legacy-audit');
const source=process.argv[2];
if(!source){console.error('Gebruik: node scripts/inspect-legacy.js /pad/naar/oude-backup');process.exitCode=1;}
else try{
 const result=inspectLegacyDirectory(source);
 console.log(JSON.stringify(result,null,2));
 if(result.requiresManualReview||!result.media.ready)process.exitCode=2;
}catch(error){console.error('Migratiecontrole:',error.message);process.exitCode=1;}
