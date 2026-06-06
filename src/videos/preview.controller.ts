import { Controller, Get, Param, Res, BadRequestException, HttpException } from "@nestjs/common";
import { StorageFactory } from '../storage/storage-factory.js';

const SEGMENT_REGEX = /^preview_\d{3}\.ts$/;
const FEATURED_BASE_KEY = process.env.FEATURED_PREVIEW_BASE_KEY;
const BUCKET = 'netflix-videos';

@Controller('preview')
export class PreviewController {
    private storage;
    constructor(private storageFactory: StorageFactory){
        this.storage = this.storageFactory.createStorageService();
    }

    @Get('featured/preview.m3u8')
    async getFeaturedManifest(@Res() res) {
        if (!FEATURED_BASE_KEY) {
            return res.status(404).send('Preview not configured');
        }

        const objectName = `${FEATURED_BASE_KEY}/preview.m3u8`;
        try {
            const stream = await this.storage.getObject(BUCKET, objectName);

            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const content = Buffer.concat(chunks).toString('utf-8');

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.send(content);
        } catch {
            return res.status(404).send('Preview not found');
        }
    }

    @Get('featured/:segment')
    async getFeaturedSegment(@Param('segment') segment: string, @Res() res) {
        if (!FEATURED_BASE_KEY) {
            return res.status(404).send('Preview not configured');
        }

        if (!SEGMENT_REGEX.test(segment)) {
            throw new BadRequestException('Invalid segment name');
        }

        if (segment.includes('..') || segment.includes('/') || segment.includes('\\')) {
            throw new BadRequestException('Invalid segment name');
        }

        const objectName = `${FEATURED_BASE_KEY}/${segment}`;
        try {
            const stat = await this.storage.getObjectStat(BUCKET, objectName);
            const stream = await this.storage.getObject(BUCKET, objectName);

            res.setHeader('Content-Type', 'video/mp2t');
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            stream.pipe(res);
        } catch {
            return res.status(404).send('Segment not found');
        }
    }
}
