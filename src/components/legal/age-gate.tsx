'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { acceptAgeGate } from '@/lib/legal/age-gate-actions'

export function AgeGate() {
  const t = useTranslations('ageGate')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onAccept() {
    const returnTo = window.location.pathname + window.location.search
    startTransition(async () => {
      await acceptAgeGate(returnTo)
    })
  }

  function onDecline() {
    router.push('/under-18')
  }

  return (
    <Dialog open modal onOpenChange={() => {}} disablePointerDismissal>
      <DialogContent
        showCloseButton={false}
        className="max-w-md"
        data-testid="age-gate"
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={onDecline}
            disabled={isPending}
            data-testid="age-gate-decline"
          >
            {t('decline')}
          </Button>
          <Button
            onClick={onAccept}
            disabled={isPending}
            data-testid="age-gate-accept"
          >
            {t('accept')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
