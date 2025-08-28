import { PostStorage, CoffeeBeanPost } from './storage'
import { cborToLexRecord, readCar } from '@atproto/repo'
import { Lexicons } from '@atproto/lexicon'
import WebSocket from 'ws'

export class FirehoseClient {
  private ws: WebSocket | null = null
  private storage: PostStorage
  private lexicons: Lexicons
  private reconnectDelay = 3000

  constructor(storage: PostStorage, lexicons: Lexicons) {
    this.storage = storage
    this.lexicons = lexicons
  }

  start(): void {
    console.log('Starting firehose connection...')
    this.connect()
  }

  private connect(): void {
    try {
      // Connect to AT Protocol firehose
      this.ws = new WebSocket('wss://bsky.network/xrpc/com.atproto.sync.subscribeRepos')
      
      this.ws.on('open', () => {
        console.log('Connected to AT Protocol firehose')
      })

      this.ws.on('message', async (data: any) => {
        try {
          // Process the CAR file message from firehose
          await this.handleMessage(data)
        } catch (error) {
          console.error('Error processing firehose message:', error)
        }
      })

      this.ws.on('error', (error) => {
        console.error('Firehose WebSocket error:', error)
      })

      this.ws.on('close', () => {
        console.log('Firehose connection closed, reconnecting...')
        setTimeout(() => this.connect(), this.reconnectDelay)
      })

    } catch (error) {
      console.error('Failed to connect to firehose:', error)
      setTimeout(() => this.connect(), this.reconnectDelay)
    }
  }

  private async handleMessage(data: any): Promise<void> {
    try {
      // Convert data to Buffer if needed
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
      
      // Parse the CAR file message from AT Protocol firehose
      const decoded = await this.decodeMessage(buffer)
      
      if (decoded && decoded.$type === 'com.atproto.sync.subscribeRepos#commit') {
        await this.handleCommit(decoded)
      }
    } catch (error) {
      // Most messages won't be coffee posts, so we'll silently ignore parsing errors
      // Only log actual processing errors if they're significant
    }
  }

  private async decodeMessage(buffer: Buffer): Promise<any> {
    try {
      // Decode the CAR file from AT Protocol firehose
      const car = await readCar(buffer)
      
      // AT Protocol sends commit messages with this structure
      // We need to find the root block and decode it
      const rootBlock = car.blocks.get(car.roots[0])
      if (!rootBlock) return null
      
      const record = cborToLexRecord(rootBlock)
      
      // Validate this is a commit message
      if (record && record.$type === 'com.atproto.sync.subscribeRepos#commit') {
        return record
      }
      
      return null
    } catch (error) {
      // CAR file parsing can fail for various reasons
      return null
    }
  }

  private async handleCommit(commit: any): Promise<void> {
    try {
      if (!commit.ops || !Array.isArray(commit.ops)) return

      // Process each operation in the commit
      for (const op of commit.ops) {
        if (op.action === 'create' && op.path && op.path.includes('coffee.outof.beanPost')) {
          await this.processCoffeePost(commit, op)
        }
      }
    } catch (error) {
      console.error('Error handling commit:', error)
    }
  }

  private async processCoffeePost(commit: any, op: any): Promise<void> {
    try {
      if (!op.cid || !commit.blocks) return

      // Decode the CAR file to get the actual record blocks
      const car = await readCar(commit.blocks)
      const recordBytes = car.blocks.get(op.cid)
      
      if (!recordBytes) return

      // Decode the CBOR record
      const record = cborToLexRecord(recordBytes)
      
      // Validate this is actually a coffee bean post
      if (!record || record.$type !== 'coffee.outof.beanPost') return

      // Validate required fields per our lexicon
      if (!record.text || typeof record.text !== 'string') return
      if (!record.createdAt || typeof record.createdAt !== 'string') return

      // Create the coffee post object with proper validation
      const coffeePost: CoffeeBeanPost = {
        $type: record.$type,
        uri: `at://${commit.repo}/${op.path}`,
        cid: op.cid.toString(),
        createdAt: record.createdAt,
        text: record.text,
        beanName: typeof record.beanName === 'string' ? record.beanName : undefined,
        origin: typeof record.origin === 'string' ? record.origin : undefined,
        roastLevel: typeof record.roastLevel === 'string' ? record.roastLevel : undefined,
        brewMethod: typeof record.brewMethod === 'string' ? record.brewMethod : undefined,
        rating: typeof record.rating === 'number' ? record.rating : undefined,
        location: this.validateLocation(record.location)
      }

      // Store the coffee post
      const wasAdded = await this.storage.addPost(coffeePost)
      if (wasAdded) {
        console.log(`☕ Stored coffee post from network: ${coffeePost.uri}`)
        console.log(`   Bean: ${coffeePost.beanName || 'Unknown'} | Origin: ${coffeePost.origin || 'Unknown'}`)
      }
    } catch (error) {
      console.error('Error processing coffee post:', error)
    }
  }

  private validateLocation(location: any): { lat: string; lng: string } | undefined {
    if (!location || typeof location !== 'object') return undefined
    if (typeof location.lat !== 'string' || typeof location.lng !== 'string') return undefined
    return { lat: location.lat, lng: location.lng }
  }

  stop(): void {
    console.log('Stopping firehose connection...')
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}
