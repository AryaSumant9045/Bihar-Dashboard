import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
    const manifestPath = path.join(process.cwd(), 'public', 'instagram-feed.json');

    try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        return Response.json(manifest, {
            headers: { 'Cache-Control': 'no-store' }
        });
    } catch (error) {
        return Response.json({
            account: 'jansuraajofficial',
            profile_url: 'https://www.instagram.com/jansuraajofficial/',
            updated_at: null,
            posts: [],
            message: error.code === 'ENOENT'
                ? 'Instagram feed has not been fetched yet. Run the server-side fetch worker.'
                : 'Instagram feed is temporarily unavailable.'
        }, {
            headers: { 'Cache-Control': 'no-store' }
        });
    }
}
