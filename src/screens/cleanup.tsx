import { ChevronRight, ListChecks, Plus } from "lucide-react"
import { useState } from "react"
import { Action } from "@/components/common"
import { MainHeader } from "@/components/layout"
import {
  TODAY,
  evidenceOf,
  paymentsOn,
  restoredOf,
  won,
  type LedgerState,
  type Payment,
} from "@/lib/ledger"

// ---------- 정리할 지출 ----------
// 오늘 결제 중 사용자가 한 번 확인해야 남는 건:
//  confirm = 근거로 복원됐지만 [맞아요]를 아직 누르지 않은 결제
//  empty   = 근거가 하나도 없어 "기록 없음"인 결제
// 송금·정산 대기 그룹 결제는 각자의 알림(링키가 찾았어요, 정산 대기)이 맡으므로 여기서 빼서 중복 안내를 막는다.
export type CleanupItem = { payment: Payment; kind: "confirm" | "empty" }

export function cleanupItems(state: LedgerState, skipped: string[]): CleanupItem[] {
  return paymentsOn(TODAY).flatMap((payment): CleanupItem[] => {
    if (payment.kind === "transfer" || skipped.includes(payment.id)) return []
    const pendingGroup =
      Boolean(payment.group) &&
      !state.splitConfirmed.includes(payment.id) &&
      !(state.personal ?? []).includes(payment.id)
    if (pendingGroup) return []
    const restored = restoredOf(payment, state)
    if (restored) {
      const verified = (state.verified ?? []).includes(payment.id) || restored.confirmed
      return verified ? [] : [{ payment, kind: "confirm" }]
    }
    return evidenceOf(payment, state).length === 0 ? [{ payment, kind: "empty" }] : []
  })
}

// 홈 배지: 눌러서 정리할 첫 건으로 바로 간다
export function CleanupBadge({ count, open }: { count: number; open: () => void }) {
  if (count === 0) return null
  return (
    <Action className="cl-badge" label={`정리할 지출 ${count}건 열기`} onClick={open}>
      <ListChecks size={20} strokeWidth={1.6} />
      <span className="cl-badge-text">
        <strong>정리할 지출 {count}건</strong>
        <small>눌러서 하나씩 확인해요</small>
      </span>
      <ChevronRight size={18} strokeWidth={1.8} />
    </Action>
  )
}

// 첫 건부터 한 장씩 확인하고, 나머지는 아래 목록(보관함)에 모아 둔다
export function CleanupScreen({
  items,
  state,
  back,
  confirm,
  skip,
  edit,
  addRecord,
}: {
  items: CleanupItem[]
  state: LedgerState
  back: () => void
  confirm: (paymentId: string) => void
  skip: (paymentId: string) => void
  edit: (payment: Payment) => void
  addRecord: (paymentId: string) => void
}) {
  // 목록에서 고른 건을 먼저 보여 준다. 처리되어 사라지면 맨 앞 건으로 돌아온다.
  const [pickedId, setPickedId] = useState<string>()
  const current = items.find((item) => item.payment.id === pickedId) ?? items[0]
  const rest = items.filter((item) => item !== current)
  if (!current) return null
  const { payment, kind } = current
  return (
    <>
      <MainHeader back={back} title="정리할 지출" />
      <div className="main-scroll cl-scroll">
        <p className="cl-progress">
          {items.length > 1 ? `${items.length}건 남았어요` : "마지막 1건이에요"}
        </p>
        <CleanupCard
          addRecord={addRecord}
          confirm={confirm}
          edit={edit}
          item={current}
          key={payment.id}
          skip={skip}
          state={state}
        />
        {rest.length > 0 && (
          <section className="cl-rest">
            <h2>다음 지출</h2>
            {rest.map((item) => (
              <Action
                className="cl-rest-row"
                key={item.payment.id}
                onClick={() => setPickedId(item.payment.id)}
              >
                <span>
                  <strong>{item.payment.merchant}</strong>
                  <small>
                    {item.payment.time} · {item.kind === "confirm" ? "맞는지 확인" : "기록 없음"}
                  </small>
                </span>
                <b>{won(item.payment.amount)}</b>
              </Action>
            ))}
          </section>
        )}
      </div>
    </>
  )
}

function CleanupCard({
  item,
  state,
  confirm,
  skip,
  edit,
  addRecord,
}: {
  item: CleanupItem
  state: LedgerState
  confirm: (paymentId: string) => void
  skip: (paymentId: string) => void
  edit: (payment: Payment) => void
  addRecord: (paymentId: string) => void
}) {
  const { payment, kind } = item
  return (
    <section className="main-card cl-card">
      {kind === "confirm" ? (
        <ConfirmBody payment={payment} state={state} />
      ) : (
        <>
          <p className="cl-orig">{payment.time} 결제</p>
          <strong className="cl-title">{payment.merchant}</strong>
          <b className="cl-amount">{won(payment.amount)}</b>
          <p className="cl-none">기록 없음</p>
        </>
      )}
      <div className="cl-actions">
        {kind === "confirm" ? (
          <>
            <Action className="pill" onClick={() => edit(payment)}>
              수정
            </Action>
            <Action className="pill primary" onClick={() => confirm(payment.id)}>
              맞아요
            </Action>
          </>
        ) : (
          <>
            <Action className="pill" onClick={() => skip(payment.id)}>
              기록 없음으로 두기
            </Action>
            <Action className="pill primary" onClick={() => addRecord(payment.id)}>
              <Plus size={12} strokeWidth={2} /> 앨범에서 불러오기
            </Action>
          </>
        )}
      </div>
    </section>
  )
}

// 복원 결과는 근거와 함께 보여 준다 (원본 → 복원된 장소, 붙은 기록)
function ConfirmBody({ payment, state }: { payment: Payment; state: LedgerState }) {
  const restored = restoredOf(payment, state)
  if (!restored) return null
  return (
    <>
      <p className="cl-orig">
        {payment.time} · {restored.original}
      </p>
      <strong className="cl-title">
        {restored.label}
        {restored.spot ? ` · ${restored.spot}` : ""}
      </strong>
      <b className="cl-amount">{won(payment.amount)}</b>
      <ul className="cl-evidence">
        {restored.evidence.map((evidence) => (
          <li key={evidence.key}>{evidence.text}</li>
        ))}
      </ul>
    </>
  )
}
