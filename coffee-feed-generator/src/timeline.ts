import { IncomingMessage, ServerResponse } from 'http'
import * as jose from 'jose'
import { PostStorage, CoffeeBeanPost } from './storage'

// Types for authentication
export type AuthToken = {
  sub: string // DID of the authenticated user
  aud: string // Audience
  iss: string // Issuer
  scope: string
  exp: number
  iat: number
}

export type AuthResult = {
  success: true
  token: AuthToken
} | {
  success: false
  error: string
  status: number
}

export type TimelineFeedItem = {
  post: string // AT URI
  reason?: {
    $type: 'coffee.outof.timeline#following'
    by: string // DID of who is followed
  }
}

export type TimelineFeedResponse = {
  feed: TimelineFeedItem[]
  cursor?: string
}

// JWT verification for AT Protocol tokens
export async function verifyAuthToken(req: IncomingMessage): Promise<AuthResult> {
  const authHeader = req.headers.authorization
  
  if (!authHeader) {
    return {
      success: false,
      error: 'Missing Authorization header',
      status: 401
    }
  }

  if (!authHeader.startsWith('Bearer ')) {
    return {
      success: false,
      error: 'Invalid authorization scheme. Expected Bearer token',
      status: 401
    }
  }

  const token = authHeader.slice(7).trim() // Remove "Bearer " prefix

  if (!token) {
    return {
      success: false,
      error: 'Missing token',
      status: 401
    }
  }

  try {
    // For development, we'll create a simple verification
    // In production, this should verify against the issuer's public key
    const decoded = jose.decodeJwt(token)
    
    // Basic token validation
    if (!decoded.sub || !decoded.aud || !decoded.iss) {
      return {
        success: false,
        error: 'Invalid token claims',
        status: 401
      }
    }

    // Check token expiration
    const now = Math.floor(Date.now() / 1000)
    if (decoded.exp && decoded.exp < now) {
      return {
        success: false,
        error: 'Token expired',
        status: 401
      }
    }

    // Verify DID format
    if (!decoded.sub.startsWith('did:')) {
      return {
        success: false,
        error: 'Invalid DID format in subject',
        status: 401
      }
    }

    // Verify scope contains required permissions
    const scope = decoded.scope as string
    if (!scope || !scope.includes('atproto')) {
      return {
        success: false,
        error: 'Insufficient scope',
        status: 403
      }
    }

    return {
      success: true,
      token: {
        sub: decoded.sub as string,
        aud: decoded.aud as string,
        iss: decoded.iss as string,
        scope: scope,
        exp: decoded.exp as number,
        iat: decoded.iat as number
      }
    }
  } catch (error) {
    console.error('JWT verification error:', error)
    return {
      success: false,
      error: 'Token verification failed',
      status: 401
    }
  }
}

// Generate personalized timeline for authenticated user
export function generatePersonalizedTimeline(
  userDid: string,
  allPosts: CoffeeBeanPost[],
  limit: number = 50
): TimelineFeedItem[] {
  // Filter and sort coffee posts
  const coffeePosts = allPosts
    .filter(post => post.$type === 'coffee.outof.beanPost')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)

  // Convert to timeline feed items
  return coffeePosts.map(post => {
    const feedItem: TimelineFeedItem = {
      post: post.uri
    }

    // Add reason if this post is from someone the user follows
    // For now, we'll simulate following relationships
    // In production, this would query the user's follow graph
    if (shouldIncludeFollowReason(userDid, post)) {
      feedItem.reason = {
        $type: 'coffee.outof.timeline#following' as const,
        by: extractDidFromUri(post.uri)
      }
    }

    return feedItem
  })
}

// Helper function to extract DID from AT URI
function extractDidFromUri(uri: string): string {
  // AT URI format: at://did:plc:xyz123/collection/rkey
  const match = uri.match(/^at:\/\/(did:[^\/]+)/)
  return match ? match[1] : ''
}

// Simulate follow relationships (in production, query actual follow graph)
function shouldIncludeFollowReason(userDid: string, post: CoffeeBeanPost): boolean {
  const authorDid = extractDidFromUri(post.uri)
  
  // Don't show follow reason for user's own posts
  if (authorDid === userDid) {
    return false
  }
  
  // For demo purposes, randomly decide if user follows this author
  // In production, this would be an actual database lookup
  const hash = simpleHash(userDid + authorDid)
  return hash % 3 === 0 // 33% chance of following
}

// Simple hash function for demo follow relationships
function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash)
}

// Handle timeline feed requests with authentication
export async function handleTimelineFeed(
  req: IncomingMessage,
  res: ServerResponse,
  storage: PostStorage,
  url: URL
): Promise<void> {
  // Verify authentication
  const authResult = await verifyAuthToken(req)
  
  if (!authResult.success) {
    res.writeHead(authResult.status)
    res.end(JSON.stringify({ 
      error: authResult.error,
      message: 'Authentication required for timeline feed'
    }))
    return
  }

  const userDid = authResult.token.sub
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
  const cursor = url.searchParams.get('cursor')

  try {
    // Generate personalized timeline
    const timelineFeed = generatePersonalizedTimeline(
      userDid,
      storage.getPosts(),
      limit
    )

    const response: TimelineFeedResponse = {
      feed: timelineFeed,
      cursor: timelineFeed.length > 0 
        ? timelineFeed[timelineFeed.length - 1].post 
        : undefined
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(response))
  } catch (error) {
    console.error('Timeline generation error:', error)
    res.writeHead(500)
    res.end(JSON.stringify({ 
      error: 'Internal server error',
      message: 'Failed to generate timeline'
    }))
  }
}

// Timeline-specific feed skeleton format for authenticated users
export function formatTimelineForFeedSkeleton(timelineFeed: TimelineFeedItem[]): any[] {
  return timelineFeed.map(item => ({
    post: item.post,
    reason: item.reason
  }))
}
