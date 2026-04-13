import { Controller, Get, Param, Res } from "@nestjs/common";
import { StorageFactory } from '../storage/storage-factory.js';

@Controller('thumbnails')
export class ThumbnailController {
    private storage;
    constructor(private storageFactory: StorageFactory){
        this.storage = this.storageFactory.createStorageService();
    }

@Get(':thumbnailId')
async getThumbnail(@Param('thumbnailId') thumbnailId: string, @Res() res) {
    console.log("here");
    
    const thumbnailPath = `thumbnails/${thumbnailId}.jpg`;
    try {
        const thumbnail = await this.storage.getObject('netflix-videos', thumbnailPath);
        res.type('image/jpeg');
        thumbnail.pipe(res);
    } catch (error) {
        return res.status(404).send('Thumbnail not found');
    }
}
}