import Router, { RequestHandler } from 'express';

import auth from '../../middlewares/auth';

import AppDataSource from '../../data-source';

import { VisualArtifact } from '../../entities';

import {

  authorizeArtifactAccess,

  contentDispositionFilename,

  artifactDownloadHref,

  resolveDownloadFilename,

} from '../../services/artifacts/artifact-access';

import { readStored, readStoredBuffer } from '../../services/artifacts/artifact-store';

import { artifactFrameHeaders } from '../../services/artifacts/csp';

import { INLINE_IMAGE_MIME_RE } from '../../services/artifacts/mime-policy';

import {

  renderForProtocol,

  renderDownloadNotice,

  renderInlineBinary,

} from '../../services/artifacts/renderers';

import type { VisualArtifact as VisualArtifactDto } from '../../@types/copilot';
import { verifyAppSessionToken } from '../../services/security/app-session';



const router = Router();



const getMeta: RequestHandler = async (req, res, next) => {

  try {

    const id = Number(req.params.id);

    const repo = AppDataSource.getRepository(VisualArtifact);

    const row = await repo.findOneBy({ _id: id });

    if (!row) return res.status(404).json({ error: 'not_found' });

    return res.json({

      id: row._id,

      artifactId: row.artifactId,

      protocol: row.protocol,

      title: row.title,

      mimeType: row.mimeType,

      conversationId: row.conversationId,

      downloadAvailable: Boolean(row.storageRef) && row.metadataJson?.downloadAvailable !== false,

      sizeBytes: row.metadataJson?.sizeBytes,

    });

  } catch (e) {

    return next(e);

  }

};



const getFrame: RequestHandler = async (req, res, next) => {

  try {

    const id = Number(req.params.id);

    const authz = await authorizeArtifactAccess(req, id);

    if (!authz.ok) {

      return res.status(authz.status).json({ error: authz.status === 401 ? 'unauthorized' : 'forbidden' });

    }



    const { row } = authz;

    const referer = req.get('Referer') ?? req.get('Referrer') ?? undefined;

    const title = row.title ?? row.artifactId;

    const mime = row.mimeType ?? '';

    const token =

      (req.headers['x-app-session-id'] as string) ||

      (typeof req.query.st === 'string' ? req.query.st : '');



    const artifactDto = (protocol: string, mimeType?: string): VisualArtifactDto => ({

      kind: 'openclaw.visual_artifact.v1',

      artifactId: row.artifactId,

      protocol: protocol as VisualArtifactDto['protocol'],

      mimeType,

    });



    if (row.protocol === 'download') {

      const href = token ? artifactDownloadHref(id, token) : null;

      const body = renderDownloadNotice(

        title,

        JSON.stringify({

          name: title,

          mediaType: mime,

          url: href,

          downloadAvailable: Boolean(row.storageRef) && row.metadataJson?.downloadAvailable !== false,

          sizeBytes: row.metadataJson?.sizeBytes,

        })

      );

      const headers = artifactFrameHeaders(artifactDto('download', 'text/html'), referer);

      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

      return res.send(body);

    }



    if (row.protocol === 'file' && row.storageRef && INLINE_IMAGE_MIME_RE.test(mime)) {

      try {

        const buf = readStoredBuffer(row.storageRef);

        const body = renderInlineBinary(title, mime, buf);

        const headers = artifactFrameHeaders(artifactDto('file', 'text/html'), referer);

        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

        return res.send(body);

      } catch {

        /* fallthrough */

      }

    }



    if (row.protocol === 'file' && row.storageRef && !INLINE_IMAGE_MIME_RE.test(mime)) {

      const href = token ? artifactDownloadHref(id, token) : null;

      const body = renderDownloadNotice(

        title,

        JSON.stringify({

          name: title,

          mediaType: mime,

          url: href,

          downloadAvailable: Boolean(href),

          sizeBytes: row.metadataJson?.sizeBytes,

        })

      );

      const headers = artifactFrameHeaders(artifactDto('download', 'text/html'), referer);

      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

      return res.send(body);

    }



    let payload: string | null = null;

    if (row.storageRef) {

      try {

        payload = readStored(row.storageRef);

      } catch {

        payload = null;

      }

    }



    const body = renderForProtocol(

      row.protocol as VisualArtifactDto['protocol'],

      title,

      payload

    );

    const headers = artifactFrameHeaders(

      artifactDto(row.protocol, row.mimeType ?? 'text/html'),

      referer,

    );

    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

    return res.send(body);

  } catch (e) {

    return next(e);

  }

};



const getDownload: RequestHandler = async (req, res, next) => {

  try {

    const id = Number(req.params.id);

    const authz = await authorizeArtifactAccess(req, id);

    if (!authz.ok) {

      return res.status(authz.status).send(authz.status === 401 ? 'unauthorized' : 'not found');

    }



    const { row } = authz;

    if (!row.storageRef) {

      return res.status(413).send('payload_unavailable');

    }



    let buf: Buffer;

    try {

      buf = readStoredBuffer(row.storageRef);

    } catch {

      return res.status(404).send('not found');

    }



    const filename = resolveDownloadFilename(row);

    const mime = row.mimeType ?? 'application/octet-stream';



    res.setHeader('Content-Type', mime);

    res.setHeader('Content-Length', String(buf.byteLength));

    res.setHeader('Content-Disposition', contentDispositionFilename(filename));

    res.setHeader('Cache-Control', 'private, no-store');

    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.send(buf);

  } catch (e) {

    return next(e);

  }

};



const listByConversation: RequestHandler = async (req, res, next) => {

  try {

    const token =

      (req.headers['x-app-session-id'] as string) ||

      (req.headers['X-App-Session-Id'] as string);

    const conversationIdStr = verifyAppSessionToken(token);

    if (!conversationIdStr) return res.status(401).json({ error: 'unauthorized' });



    const conversationId = Number(req.params.id);

    if (String(conversationId) !== conversationIdStr) {

      return res.status(403).json({ error: 'forbidden' });

    }



    const repo = AppDataSource.getRepository(VisualArtifact);

    const items = await repo.find({

      where: { conversationId },

      order: { createdAt: 'ASC' },

    });

    return res.json({

      items: items.map((row) => ({

        id: row._id,

        artifactId: row.artifactId,

        protocol: row.protocol,

        title: row.title,

        mimeType: row.mimeType,

        runId: row.runId,

        downloadAvailable:

          Boolean(row.storageRef) && row.metadataJson?.downloadAvailable !== false,

        sizeBytes:

          typeof row.metadataJson?.sizeBytes === 'number'

            ? row.metadataJson.sizeBytes

            : undefined,

      })),

    });

  } catch (e) {

    return next(e);

  }

};



router.get('/artifacts/:id(\\d+)', auth, getMeta);

router.get('/artifacts/:id(\\d+)/frame', getFrame);

router.get('/artifacts/:id(\\d+)/download', getDownload);

router.get('/conversation/:id(\\d+)/artifacts', auth, listByConversation);



export default router;


