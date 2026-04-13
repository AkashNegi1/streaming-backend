import { exec } from "child_process";

 export function runffmpeg(command: string): Promise<void>{
     return new Promise((resolve, reject) => {
         exec(command, (error) => {
             if(error){
                 reject(error);
                 return;
             }
             resolve();
         });
     });
 }