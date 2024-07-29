import { Job } from 'bullmq'
import {
  Blocks,
  EmojiReaction,
  FederatedHost,
  Follows,
  Mutes,
  Post,
  PostMentionsUserRelation,
  User,
  UserLikesPostRelations,
  sequelize
} from '../../db'
import { environment } from '../../environment'
import { getUserIdFromRemoteId } from '../cacheGetters/getUserIdFromRemoteId'
import { getFederatedHostIdFromUrl } from '../cacheGetters/getHostIdFromUrl'
import { getPetitionSigned } from '../activitypub/getPetitionSigned'
import { processUserEmojis } from '../activitypub/processUserEmojis'
import { fediverseTag } from '../../interfaces/fediverse/tags'
import { logger } from '../logger'
import { redisCache } from '../redis'

// This function will return userid after processing it.
async function getRemoteActorIdProcessor(job: Job) {
  const actorUrl: string = job.data.actorUrl
  const forceUpdate: boolean = job.data.forceUpdate
  let res = await getUserIdFromRemoteId(actorUrl)
  let url = undefined
  try {
    url = new URL(actorUrl)
  } catch (error) {
    res = await getDeletedUser()
    url = undefined
    logger.debug({
      message: 'Invalid url',
      url: actorUrl,
      stack: new Error().stack
    })
  }
  if (res === '' || (forceUpdate && url != undefined)) {
    let federatedHost = await getHostFromCache(url?.host ? url.host : '')
    const hostBanned = federatedHost?.blocked
    if (hostBanned) {
      res = await getDeletedUser()
    } else {
      const user = await User.findByPk(job.data.userId)
      const userPetition = await getPetitionSigned(user, actorUrl)
      if (userPetition) {
        if (!federatedHost) {
          const federatedHostToCreate = {
            displayName: url?.host.toLocaleLowerCase(),
            publicInbox: userPetition.endpoints?.sharedInbox
          }
          federatedHost = await FederatedHost.create(federatedHostToCreate)
        }
        const remoteMentionUrl = typeof userPetition.url === 'string' ? userPetition.url : ''
        let followers = 0
        let followed = 0
        if (userPetition.followers) {
          const followersPetition = await getPetitionSigned(user, userPetition.followers)
          if (followersPetition && followersPetition.totalItems) {
            followers = followersPetition.totalItems
          }
        }
        if (userPetition.following) {
          const followingPetition = await getPetitionSigned(user, userPetition.following)
          if (followingPetition && followingPetition.totalItems) {
            followed = followingPetition.totalItems
          }
        }
        const userData = {
          url: `@${userPetition.preferredUsername}@${url?.host}`,
          name: userPetition.name ? userPetition.name : userPetition.preferredUsername,
          email: null,
          description: userPetition.summary,
          avatar: userPetition.icon?.url ? userPetition.icon.url : `${environment.mediaUrl}/uploads/default.webp`,
          headerImage: '', //userPetition.image?.url ? userPetition.image.url : ``,
          password: 'NOT_A_WAFRN_USER_NOT_REAL_PASSWORD',
          publicKey: userPetition.publicKey?.publicKeyPem,
          remoteInbox: userPetition.inbox,
          remoteId: actorUrl,
          activated: true,
          federatedHostId: federatedHost.id,
          remoteMentionUrl: remoteMentionUrl,
          followersCollectionUrl: userPetition.followers,
          followingCollectionUrl: userPetition.following,
          isBot: userPetition.type != 'Person',
          followerCount: followers,
          followingCount: followed,
          updatedAt: new Date()
        }
        federatedHost.publicInbox = userPetition.endpoints?.sharedInbox
        await federatedHost.save()
        let userRes
        const existingUsers = await User.findAll({
          where: {
            urlToLower: userData.url.toLowerCase()
          }
        })
        if (res) {
          if (res !== (await getDeletedUser())) {
            userRes = await User.findByPk(res)
            if (existingUsers && existingUsers.length > 0 && existingUsers[0] && userRes?.id !== existingUsers[0]?.id) {
              const existingUser = existingUsers[0]
              existingUser.activated = 0
              existingUser.remoteId = `${existingUser.remoteId}_OVERWRITTEN_ON${new Date().getTime()}`
              existingUser.url = `${existingUser.url}_OVERWRITTEN_ON${new Date().getTime()}`
              await existingUser.save()
              const updates = [
                Follows.update(
                  {
                    followerId: userRes.id
                  },
                  {
                    where: {
                      followerId: existingUser.id
                    }
                  }
                ),
                Follows.update(
                  {
                    followedId: userRes.id
                  },
                  {
                    where: {
                      followedId: existingUser.id
                    }
                  }
                ),
                Post.update(
                  {
                    userId: userRes.id
                  },
                  {
                    where: {
                      userId: existingUser.id
                    }
                  }
                ),
                UserLikesPostRelations.update(
                  {
                    userId: userRes.id
                  },
                  {
                    where: {
                      userId: existingUser.id
                    }
                  }
                ),
                EmojiReaction.update(
                  {
                    userId: userRes.id
                  },
                  {
                    where: {
                      userId: existingUser.id
                    }
                  }
                ),
                Blocks.update(
                  {
                    blockedid: userRes.id
                  },
                  {
                    where: {
                      blockedid: existingUser.id
                    }
                  }
                ),
                Blocks.update(
                  {
                    blockerId: userRes.id
                  },
                  {
                    where: {
                      blockerId: existingUser.id
                    }
                  }
                ),
                Mutes.update(
                  {
                    muterid: userRes.id
                  },
                  {
                    where: {
                      muterid: existingUser.id
                    }
                  }
                ),
                Mutes.update(
                  {
                    mutedId: userRes.id
                  },
                  {
                    where: {
                      mutedId: existingUser.id
                    }
                  }
                ),
                PostMentionsUserRelation.update(
                  {
                    userid: userRes.id
                  },
                  {
                    where: {
                      userid: existingUser.id
                    }
                  }
                )
              ]
              await Promise.all(updates)
              await redisCache.del('userRemoteId:' + existingUser.remoteId)
            }
            if (userRes) {
              userRes.update(userData)
              await userRes.save()
            } else {
              logger.debug({
                message: 'user is null',
                id: res,
                url: actorUrl
              })
            }
          }
        } else {
          if (existingUsers && existingUsers[0]) {
            existingUsers[0].update(userData)
            await existingUsers[0].save()
          } else {
            userRes = await User.create(userData)
          }
        }
        res = userRes?.id ? userRes.id : await getDeletedUser()
        try {
          if (userRes) {
            const emojis = [
              ...new Set(
                userPetition?.tag ? userPetition.tag.filter((elem: fediverseTag) => elem.type === 'Emoji') : []
              )
            ]
            await processUserEmojis(userRes, emojis)
          }
        } catch (error) {
          logger.info({
            message: `Error processing emojis from user ${userRes?.url}`,
            error: error,
            tags: userPetition?.tag,
            userPetition: userPetition
          })
        }
      }
    }
  }
  return res
}

async function getHostFromCache(displayName: string): Promise<any> {
  let res = undefined
  try {
    res = await FederatedHost.findByPk(await getFederatedHostIdFromUrl(displayName))
  } catch (error) {
    logger.debug({
      message: 'Error on getHostFromCache',
      host: displayName,
      error: error
    })
  }
  return res
}

async function getDeletedUser() {
  return await getUserIdFromRemoteId(`https://${environment.instanceUrl}/fediverse/blog/${environment.deletedUser}`)
}

export { getRemoteActorIdProcessor }
