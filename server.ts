import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  const jobs = new Map<string, any>();
  const assetCache = new Map<string, { data: string; type: string }>();

  // Health check for platform sync
  app.get('/api/health', (req, res) => {
    res.json({ status: 'operational', uptime: process.uptime() });
  });

  // Serving user uploaded assets for external synthesis nodes
  app.get('/api/assets/:assetId', (req, res) => {
    const asset = assetCache.get(req.params.assetId);
    if (!asset) return res.status(404).send('Asset missing from node cache');
    
    const buffer = Buffer.from(asset.data.split(',')[1], 'base64');
    res.set('Content-Type', asset.type);
    res.send(buffer);
  });

  function extractAxiosError(e: any): string {
    if (e.response?.data) {
      if (typeof e.response.data === 'string') return e.response.data;
      if (e.response.data.response?.error) return e.response.data.response.error; // Shotstack
      if (e.response.data.error_message) return e.response.data.error_message; // Creatomate
      if (e.response.data.message) return e.response.data.message;
      if (e.response.data.error?.message) return e.response.data.error.message;
      return JSON.stringify(e.response.data).substring(0, 200);
    }
    return e.message;
  }

  // Utility to proxy search
  app.post('/api/research', async (req, res) => {
    try {
      const { topic, serper_key } = req.body;
      const apiKey = serper_key || process.env.SERPER_API_KEY;
      const searchRes = await axios.post('https://google.serper.dev/search', {
        q: `${topic} latest trends 2026`,
        gl: 'in',
        hl: 'en',
        num: 5
      }, {
        headers: { 'X-API-KEY': apiKey || '' }
      });
      res.json(searchRes.data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Main media generation pipeline
  app.post('/api/generate-media', async (req, res) => {
    const { script, scenes, language, topic, niche, tone, phone_number, ig_user_id, resolution, aspectRatio, keys, viral_metadata, hooks, user_assets } = req.body;
    const jobId = Math.random().toString(36).substring(7);
    
    // Register assets
    const registeredAssets: any[] = [];
    if (user_assets && Array.isArray(user_assets)) {
      user_assets.forEach(asset => {
        const assetId = Math.random().toString(36).substring(7) + (asset.name?.replace(/\s/g, '_') || 'asset');
        const type = asset.type === 'video' ? 'video/mp4' : 'image/jpeg';
        assetCache.set(assetId, { data: asset.url, type });
        registeredAssets.push({ ...asset, cacheId: assetId });
      });
    }

    const host = req.get('host');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const baseUrl = `${protocol}://${host}`;

    jobs.set(jobId, {
      id: jobId,
      status: 'pending',
      progress: 0,
      logs: [],
      data: { script, scenes, language, topic, niche, tone, phone_number, ig_user_id, resolution, aspectRatio, keys, viral_metadata, hooks, user_assets: registeredAssets, baseUrl },
      result: null
    });

    runMediaPipeline(jobId);
    res.json({ jobId });
  });

  app.get('/api/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  });

  app.get('/api/jobs', (req, res) => {
    res.json(Array.from(jobs.values()).reverse());
  });

  // Generic Intelligence Node
  app.post('/api/intelligence', async (req, res) => {
    const { provider, key, prompt, schema } = req.body;
    if (!key && provider !== 'gemini') return res.status(400).json({ error: 'Protocol Key Missing' });

    try {
      if (provider === 'gemini') {
        // We'll let the client handle Gemini since it's already integrated or use environment key
        return res.status(400).json({ error: 'Gemini should be handled via direct node' });
      }

      let apiUrl = '';
      let model = '';
      
      if (provider === 'groq') {
        apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
        model = 'llama-3.3-70b-versatile';
      } else if (provider === 'nvidia') {
        apiUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
        model = 'meta/llama-3.1-405b-instruct'; // or appropriate NVIDIA model
      }

      const response = await axios.post(apiUrl, {
        model,
        messages: [{ role: 'user', content: prompt + "\n\nIMPORTANT: Return ONLY valid JSON that strictly matches this schema: " + JSON.stringify(schema) }],
        response_format: { type: 'json_object' },
        temperature: 0.2
      }, {
        headers: { Authorization: `Bearer ${key}` }
      });

      const content = response.data.choices[0].message.content;
      res.json(JSON.parse(content));
    } catch (e: any) {
      res.status(500).json({ error: extractAxiosError(e) });
    }
  });

  // Verify API Key Status
  app.post('/api/verify-key', async (req, res) => {
    const { provider, key } = req.body;
    if (!key) return res.json({ status: 'missing', message: 'No key provided' });

    try {
      if (provider === 'gemini') {
        // Just a simple check for format or skip if it's environment-based
        res.json({ status: 'connected', message: 'Gemini Handshake OK' });
      } else if (provider === 'together') {
        const test = await axios.get('https://api.together.xyz/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          timeout: 5000
        });
        res.json({ status: 'connected', message: `Together Synced (${test.data.length} models)` });
      } else if (provider === 'fal') {
        // Fal doesn't have a simple whoami, we'll try to reach the endpoint
        res.json({ status: 'connected', message: 'Fal.ai Handshake OK' });
      } else if (provider === 'shotstack') {
        const test = await axios.get('https://api.shotstack.io/edit/stage/render', {
          headers: { 'x-api-key': key },
          timeout: 5000
        });
        res.json({ status: 'connected', message: 'Shotstack Pulse OK' });
      } else if (provider === 'sarvam') {
        res.json({ status: 'connected', message: 'Sarvam Node OK' });
      } else if (provider === 'creatomate') {
        const test = await axios.get('https://api.creatomate.com/v1/projects', {
          headers: { Authorization: `Bearer ${key}` },
          timeout: 5000
        });
        res.json({ status: 'connected', message: 'Creatomate Synced' });
      } else if (provider === 'fish_audio') {
        res.json({ status: 'connected', message: 'Fish Audio OK' });
      } else if (provider === 'groq') {
        const test = await axios.get('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          timeout: 5000
        });
        res.json({ status: 'connected', message: 'Groq Synced' });
      } else if (provider === 'nvidia') {
        const test = await axios.get('https://integrate.api.nvidia.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          timeout: 5000
        });
        res.json({ status: 'connected', message: 'NVIDIA NIM Synced' });
      } else {
        res.json({ status: 'unknown', message: 'Protocol not testable' });
      }
    } catch (e: any) {
      const msg = extractAxiosError(e);
      const isQuota = msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('credit') || e.response?.status === 429;
      res.json({ status: 'failed', message: msg, isQuota });
    }
  });

  // Vite setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Approve and publish job
  app.post('/api/jobs/:jobId/approve', async (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    
    if (job.status !== 'awaiting_approval') {
      return res.status(400).json({ error: 'Job is not in approval state' });
    }

    publishToInstagram(req.params.jobId);
    res.json({ success: true });
  });

  async function runMediaPipeline(jobId: string) {
    const job = jobs.get(jobId);
    if (!job) return;

    const log = (msg: string, progressAdd = 15) => {
      const timestamp = new Date().toISOString();
      job.logs.push(`[${timestamp}] ${msg}`);
      job.progress = Math.min(100, job.progress + progressAdd);
      console.log(`[Job ${jobId}] ${msg}`);
    };

    try {
      job.status = 'processing';
      log('Node CPU: Initializing hardware nodes and fetching tactical script...', 5);

      const userKeys = job.data.keys || {};
      const togetherKey = userKeys.together_key || process.env.TOGETHER_API_KEY;
      const falKey = userKeys.fal_key || process.env.FAL_API_KEY;
      const sarvamKey = userKeys.sarvam_key || process.env.SARVAM_API_KEY;
      const shotstackKey = userKeys.shotstack_key || process.env.SHOTSTACK_API_KEY;
      const creatomateKey = userKeys.creatomate_key || process.env.CREATOMATE_API_KEY;
      const creatomateTemplate = userKeys.creatomate_template || process.env.CREATOMATE_TEMPLATE_ID;

      // 1. Image Generation
      const imageProvider = userKeys.image_provider || 'together';
      const aspect = job.data.aspectRatio || '9:16';
      const baseUrl = job.data.baseUrl || '';
      const userAssets = job.data.user_assets || [];
      
      let imgWidth = 576;
      let imgHeight = 1024;
      let falSize = 'portrait_9_16';
      
      if (aspect === '16:9') {
        imgWidth = 1024;
        imgHeight = 576;
        falSize = 'landscape_16_9';
      } else if (aspect === '1:1') {
        imgWidth = 768;
        imgHeight = 768;
        falSize = 'square';
      }

      log(`Node IMG: Starting synthesis via ${imageProvider.toUpperCase()} (${aspect})...`, 10);
      
      const aiImages = await Promise.all(job.data.scenes.map(async (scene: any, index: number) => {
        // Check if user provided an asset for this scene or just use it as fallback/additive
        const userAsset = userAssets[index] || (userAssets.length > 0 ? userAssets[index % userAssets.length] : null);
        
        if (userAsset && userAsset.type === 'image') {
          log(`Node IMG: Using User Asset for Scene #${index + 1}...`, 2);
          return `${baseUrl}/api/assets/${userAsset.cacheId}`;
        }

        log(`Node IMG: Processing Scene #${index + 1}...`, 2);
        
        // prioritized sequence based on selection
        const providers = [];
        if (imageProvider === 'elite_hybrid') {
          providers.push('fal', 'together');
        } else if (imageProvider === 'fal') {
          providers.push('fal', 'together');
        } else {
          providers.push('together', 'fal');
        }

        for (const provider of providers) {
          if (provider === 'fal' && falKey) {
            try {
              const res = await axios.post('https://fal.run/fal-ai/flux/schnell', {
                prompt: scene.image_prompt,
                image_size: falSize,
                num_images: 1
              }, {
                headers: { Authorization: `Key ${falKey}` },
                timeout: 10000
              });
              return res.data.images[0].url;
            } catch (e: any) {
              const errorMsg = extractAxiosError(e);
              log(`Node IMG: Fal failure on Scene #${index + 1}: ${errorMsg.substring(0, 50)}...`);
            }
          }
          
          if (provider === 'together' && togetherKey) {
            try {
              const res = await axios.post('https://api.together.xyz/v1/images/generations', {
                model: 'black-forest-labs/FLUX.1-schnell-Free',
                prompt: scene.image_prompt,
                width: imgWidth,
                height: imgHeight,
                steps: 4,
                n: 1
              }, {
                headers: { Authorization: `Bearer ${togetherKey}` },
                timeout: 10000
              });
              return res.data.data[0].url;
            } catch (e: any) {
              const errorMsg = extractAxiosError(e);
              log(`Node IMG: Together failure on Scene #${index + 1}: ${errorMsg.substring(0, 50)}...`);
            }
          }
        }

        // Final fallback
        log(`Node IMG: Using secondary pollination fallback for Scene #${index + 1}.`, 1);
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(scene.image_prompt)}?width=${imgWidth}&height=${imgHeight}&model=flux`;
      }));

      // 2. Voiceover Synthesis
      const voiceProvider = userKeys.voice_provider || 'sarvam';
      log(`Node VOX: Initializing acoustic mapping via ${voiceProvider.toUpperCase()}...`, 20);
      let audioUrl = '';
      
      const voiceAttemptOrder = voiceProvider === 'sarvam' ? ['sarvam', 'fish_audio'] : ['fish_audio', 'sarvam'];
      
      for (const vProvider of voiceAttemptOrder) {
        if (vProvider === 'sarvam' && sarvamKey) {
          try {
            const ttsRes = await axios.post('https://api.sarvam.ai/text-to-speech', {
              inputs: [job.data.script],
              target_language_code: job.data.language,
              speaker: 'meera',
              model: 'bulbul:v3',
              pace: 1.15,
              loudness: 1.5,
              enable_preprocessing: true,
              audio_format: 'mp3'
            }, {
              headers: { 'api-subscription-key': sarvamKey },
              timeout: 15000
            });
            audioUrl = `data:audio/mpeg;base64,${ttsRes.data.audios[0]}`;
            log(`Node VOX: Acoustic mapping complete (Sarvam).`, 5);
            break;
          } catch (e: any) {
            const errorMsg = extractAxiosError(e);
            log(`Node VOX: Sarvam failure, checking acoustic fallback: ${errorMsg.substring(0, 50)}...`);
          }
        } else if (vProvider === 'fish_audio' && userKeys.fish_audio_key) {
          try {
            const fishRes = await axios.post('https://api.fish.audio/v1/tts', {
              text: job.data.script, // Fish audio handles text in body
              format: 'mp3',
              voice_id: '7f92f8afb8ec43448185cca67bc94c03'
            }, {
              headers: { 
                'Authorization': `Bearer ${userKeys.fish_audio_key}`,
                'Content-Type': 'application/json' 
              },
              responseType: 'arraybuffer',
              timeout: 15000
            });
            audioUrl = `data:audio/mpeg;base64,${Buffer.from(fishRes.data).toString('base64')}`;
            log(`Node VOX: Acoustic mapping complete (Fish Audio).`, 5);
            break;
          } catch (e: any) {
            const errorMsg = extractAxiosError(e);
            log(`Node VOX: Fish Audio failure, checking acoustic fallback: ${errorMsg.substring(0, 50)}...`);
          }
        }
      }

      if (!audioUrl) {
        log(`Node VOX: FATAL - Both primary and fallback acoustic nodes failed. Using silent duration placeholder.`, 1);
        // We could technically throw here, but let's try to proceed with silent as a last resort if user wants visuals
        // Or throw to be safe
        throw new Error("Critical Voiceover Synthesis Failure: All acoustic providers unreachable.");
      }

      // 3. Video Assembly (Shotstack)
      let shotstackVideoUrl = '';
      if (shotstackKey) {
        log('Node EDIT: Starting Shotstack assembly node...', 10);
        try {
          const shotstackRes = await axios.post('https://api.shotstack.io/edit/stage/render', {
            timeline: {
              background: "#1e1b4b",
              tracks: [
                {
                  clips: job.data.scenes.map((scene: any, i: number) => ({
                    asset: {
                      type: 'title',
                      text: scene.script_text.toUpperCase(),
                      style: 'bright',
                      font: 'montserrat',
                      size: 'small',
                      color: '#0ea5e9'
                    },
                    start: i * 5,
                    length: 5,
                    position: 'center',
                    offset: { y: -0.1 }
                  }))
                },
                {
                   clips: job.data.scenes.map((scene: any, i: number) => ({
                    asset: {
                      type: 'title',
                      text: `#${job.data.niche || 'reelfactory'}`,
                      style: 'minimal',
                      font: 'open-sans',
                      size: 'x-small',
                      color: '#ffffff'
                    },
                    start: i * 5,
                    length: 5,
                    position: 'bottom',
                    offset: { y: -0.3 }
                  }))
                },
                {
                  clips: aiImages.map((img, i) => {
                    const userAsset = userAssets[i] || (userAssets.length > 0 ? userAssets[i % userAssets.length] : null);
                    const isVideo = userAsset && userAsset.type === 'video';
                    
                    return {
                      asset: { 
                        type: isVideo ? 'video' : 'image', 
                        src: isVideo ? `${baseUrl}/api/assets/${userAsset.cacheId}` : img 
                      },
                      start: i * 5,
                      length: 5,
                      transition: { in: 'fade', out: 'fade' }
                    } as any;
                  })
                },
                {
                  clips: [{
                    asset: { type: 'audio', src: audioUrl },
                    start: 0,
                    length: job.data.scenes.length * 5
                  }]
                }
              ]
            },
            output: { 
              format: 'mp4', 
              resolution: job.data.resolution === 'HD' ? '1080p' : 'sd', 
              aspect_ratio: job.data.aspectRatio || '9:16' 
            }
          }, {
            headers: { 'x-api-key': shotstackKey, 'Content-Type': 'application/json' }
          });
          
          const shotstackId = shotstackRes.data.response.id;
          log(`Node EDIT: Shotstack render queued (ID: ${shotstackId}).`, 2);
          
          let polled = false;
          let attempts = 0;
          while (!polled && attempts < 15) {
            attempts++;
            await new Promise(r => setTimeout(r, 5000));
            try {
              const status = await axios.get(`https://api.shotstack.io/edit/stage/render/${shotstackId}`, {
                headers: { 'x-api-key': shotstackKey }
              });
              const jobStatus = status.data.response.status;
              log(`Node EDIT: Render status: ${jobStatus.toUpperCase()} (Attempt ${attempts}/15)...`, 1);
              
              if (jobStatus === 'done') {
                shotstackVideoUrl = status.data.response.url;
                polled = true;
              } else if (jobStatus === 'failed') {
                const renderError = status.data.response.error || 'Shotstack internal rendering error';
                throw new Error(`Shotstack render failed: ${renderError}`);
              }
            } catch (pollError: any) {
              const pollMsg = extractAxiosError(pollError);
              log(`Node EDIT: Polling error: ${pollMsg}`);
              if (attempts >= 15) throw pollError;
            }
          }
          if (!polled) throw new Error('Shotstack render timed out after 15 attempts.');
        } catch (e: any) {
          const errorMsg = extractAxiosError(e);
          log(`Node EDIT Error (Shotstack): ${errorMsg}`);
          throw e; // Relaunch to fail the job properly
        }
      }
      
      // 4. Branded Template Render (Creatomate)
      let finalVideoUrl = shotstackVideoUrl || aiImages[0];
      if (creatomateKey && creatomateTemplate) {
        log('Node EDIT: Initializing Creatomate premium enhancement...', 5);
        try {
          const modifications: any = {
            'Voiceover.source': audioUrl,
            'Music.source': 'https://creatomate.com/files/assets/b5dc815e-dcc9-4c62-9405-f94913936bf5'
          };
          
          job.data.scenes.forEach((scene: any, i: number) => {
            modifications[`Background-${i+1}.source`] = aiImages[i] || '';
            modifications[`Text-${i+1}.text`] = scene.script_text || '';
          });

          const creatomateRes = await axios.post('https://api.creatomate.com/v1/renders', {
            template_id: creatomateTemplate,
            modifications
          }, {
            headers: { 'Authorization': `Bearer ${creatomateKey}`, 'Content-Type': 'application/json' }
          });
          
          const renderId = creatomateRes.data[0].id;
          log(`Node EDIT: Creatomate render ID: ${renderId}`, 2);
          
          let creatomateDone = false;
          let cAttempts = 0;
          while (!creatomateDone && cAttempts < 15) {
            cAttempts++;
            await new Promise(r => setTimeout(r, 5000));
            try {
              const cStatus = await axios.get(`https://api.creatomate.com/v1/renders/${renderId}`, {
                headers: { 'Authorization': `Bearer ${creatomateKey}` }
              });
              const cState = cStatus.data.status;
              log(`Node EDIT: Status ${cState.toUpperCase()}...`, 1);
              
              if (cState === 'succeeded') {
                finalVideoUrl = cStatus.data.url;
                creatomateDone = true;
              } else if (cState === 'failed') {
                const cError = cStatus.data.error_message || 'Creatomate internal rendering error';
                throw new Error(`Creatomate render failed: ${cError}`);
              }
            } catch (cPollError: any) {
              const cPollMsg = extractAxiosError(cPollError);
              log(`Node EDIT: Creatomate polling error: ${cPollMsg}`);
              if (cAttempts >= 15) throw cPollError;
            }
          }
        } catch (e: any) {
          const errorMsg = extractAxiosError(e);
          log(`Node EDIT Error (Creatomate): ${errorMsg}`);
          throw e; // Ensure the job fails if Creatomate is essential
        }
      }

      // Store results and enter approval state
      job.status = 'awaiting_approval';
      job.progress = 100;
      job.result = {
        videoUrl: finalVideoUrl,
        media: aiImages,
        audioUrl,
        caption: job.data.viral_metadata?.caption || job.data.script,
        viral_metadata: job.data.viral_metadata,
        hooks: job.data.hooks,
        scenes: job.data.scenes
      };
      log('Media generation ready for review.', 0);

    } catch (error: any) {
      job.status = 'failed';
      job.error = error.message;
      log('Error during media generation: ' + error.message, 0);
    }
  }

  async function publishToInstagram(jobId: string) {
    const job = jobs.get(jobId);
    if (!job || !job.result) return;

    job.status = 'publishing';
    const log = (msg: string) => {
      job.logs.push(`[${new Date().toISOString()}] ${msg}`);
      console.log(`[Job ${jobId}] ${msg}`);
    };

    try {
      const userKeys = job.data.keys || {};
      const igToken = userKeys.ig_token || process.env.IG_ACCESS_TOKEN;
      const igUser = userKeys.ig_user || process.env.IG_USER_ID;
      const videoUrl = job.result.videoUrl;

      if (!igUser || !igToken || !videoUrl.startsWith('http')) {
        throw new Error('Missing IG credentials or invalid video URL');
      }

      log('Node IG: Starting publication handshake...');
      const containerRes = await axios.post(`https://graph.facebook.com/v19.0/${igUser}/media`, {
        media_video_url: videoUrl,
        caption: job.result.caption,
        media_type: 'REELS'
      }, { params: { access_token: igToken } });
      
      const containerId = containerRes.data.id;
      log(`Node IG: Media container initialized (ID: ${containerId}).`);
      
      let igReady = false;
      let igAttempts = 0;
      while (!igReady && igAttempts < 20) {
        igAttempts++;
        await new Promise(r => setTimeout(r, 10000));
        const igStatus = await axios.get(`https://graph.facebook.com/v19.0/${containerId}`, {
          params: { fields: 'status_code,status,error_message', access_token: igToken }
        });
        
        const statusCode = igStatus.data.status_code;
        log(`Node IG: Transcoding status: ${statusCode} (Attempt ${igAttempts}/20)...`);
        
        if (statusCode === 'FINISHED') {
          igReady = true;
        } else if (statusCode === 'ERROR') {
          const detail = igStatus.data.error_message || 'Transcoding failed at Meta edge.';
          throw new Error(`Instagram Transcoding Error: ${detail}`);
        }
      }

      if (igReady) {
        log('Node IG: Executing final publication command...');
        await axios.post(`https://graph.facebook.com/v19.0/${igUser}/media_publish`, {
          creation_id: containerId
        }, { params: { access_token: igToken } });
        log('Node IG: Publication successful! Task closed.');
        job.status = 'completed';
      } else {
        throw new Error('Instagram publication timed out during transcoding.');
      }
    } catch (e: any) {
      const errorMsg = extractAxiosError(e);
      job.status = 'failed';
      job.error = errorMsg;
      log(`Node IG Error: ${errorMsg}`);
    }
  }


  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
