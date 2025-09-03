import { PostStorage, CoffeeBeanPost } from './storage'
import { Firehose } from '@atproto/sync'
import { Lexicons } from '@atproto/lexicon'
import { IdResolver } from '@atproto/identity'

export class FirehoseClient {
  private firehose: Firehose | null = null
  private storage: PostStorage
  private lexicons: Lexicons
  private idResolver: IdResolver

  constructor(storage: PostStorage, lexicons: Lexicons) {
    this.storage = storage
    this.lexicons = lexicons
    this.idResolver = new IdResolver()
  }

  start(): void {
    console.log('Starting firehose connection to local PDS...')
    
    this.firehose = new Firehose({
      service: 'ws://localhost:3000',
      idResolver: this.idResolver,
      filterCollections: ['coffee.outof.beanPost'],
      handleEvent: async (evt) => {
        console.log(`📡 Received event: ${evt.event}`)
        if ('collection' in evt) {
          console.log(`   Collection: ${evt.collection}`)
        }
        if (evt.event === 'create' || evt.event === 'update') {
          await this.handleCoffeePost(evt)
        }
      },
      onError: (err: Error) => {
        console.error('Firehose error:', err)
      },
    })

    this.firehose.start()
  }

  private async handleCoffeePost(evt: any): Promise<void> {
    try {
      // Check if this is a coffee post
      if (evt.collection !== 'coffee.outof.beanPost') return
      
      const record = evt.record
      if (!record || record.$type !== 'coffee.outof.beanPost') return

      // Validate required fields
      if (!record.text || typeof record.text !== 'string') return
      if (!record.createdAt || typeof record.createdAt !== 'string') return

      // Create the coffee post object
      const coffeePost: CoffeeBeanPost = {
        $type: record.$type,
        uri: evt.uri.toString(),
        cid: evt.cid?.toString() || '',
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
        console.log(`☕ Detected coffee post: ${coffeePost.uri}`)
        console.log(`   Text: ${coffeePost.text}`)
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
    if (this.firehose) {
      this.firehose.destroy()
      this.firehose = null
    }
  }
}
