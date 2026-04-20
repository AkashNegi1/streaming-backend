import { exec } from "child_process";
import { FFPROBE } from '../constants.js';

 export function runffmpeg(localPath: string, outputPath: string, useGpu: boolean, task: 'TRANSCODE' | 'THUMBNAIL'): Promise<void>{
    let command: string;
    if (task == 'TRANSCODE'){
        const {
                width: w360,
                height: h360,
                bitrate: b360,
              } = FFPROBE.QUALITIES[360];
              const {
                width: w480,
                height: h480,
                bitrate: b480,
              } = FFPROBE.QUALITIES[480];
              const {
                width: w720,
                height: h720,
                bitrate: b720,
              } = FFPROBE.QUALITIES[720];
        if(useGpu){
            command = `ffmpeg -y -hwaccel cuda -hwaccel_output_format cuda -i "${localPath}" \
                       -filter_complex "[0:v]split=3[v1][v2][v3]; \
                       [v1]scale_cuda=${w360}:${h360}[v360]; \
                       [v2]scale_cuda=${w480}:${h480}[v480]; \
                       [v3]scale_cuda=${w720}:${h720}[v720]" \
                       \
                       -map "[v360]" -map a:0 -c:v:0 h264_nvenc -b:v:0 ${b360}k -preset p4 -g 48 \
                       -map "[v480]" -map a:0 -c:v:1 h264_nvenc -b:v:1 ${b480}k -preset p4 -g 48 \
                       -map "[v720]" -map a:0 -c:v:2 h264_nvenc -b:v:2 ${b720}k -preset p4 -g 48 \
                       \
                       -c:a aac -b:a 128k \
                       \
                       -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
                       -master_pl_name master.m3u8 \
                       -f hls \
                       -hls_time ${FFPROBE.HLS_TIME} \
                       -hls_playlist_type vod \
                       -hls_segment_filename "${outputPath}/v%v/segment_%03d.ts" \
                       "${outputPath}/v%v/index.m3u8"`                    
        }else{
            command =  `ffmpeg -i "${localPath}" -filter_complex "[0:v]split=3[v1][v2][v3];[v1]scale=w=${w360}:h=${h360}[v360];[v2]scale=w=${w480}:h=${h480}[v480];[v3]scale=w=${w720}:h=${h720}[v720]" -map "[v360]" -map a:0 -b:v:0 ${b360}k -map "[v480]" -map a:0 -b:v:1 ${b480}k -map "[v720]" -map a:0 -b:v:2 ${b720}k -preset veryfast -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" -master_pl_name master.m3u8 -f hls -hls_time ${FFPROBE.HLS_TIME} -hls_playlist_type vod -hls_segment_filename "${outputPath}/v%v/segment_%03d.ts" "${outputPath}/v%v/index.m3u8"`
        }
    }else if(task == 'THUMBNAIL'){
            command = `ffmpeg -ss 00:00:03 -i "${localPath}" -vf "select='gt(scene,0.4)',scale=640:360" -frames:v 1 "${outputPath}"`
    }
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