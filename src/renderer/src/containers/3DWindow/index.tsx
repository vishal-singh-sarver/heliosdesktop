import React from 'react'
import type { Reducer } from 'redux'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import reducer from './store/reducer'
import saga from './store/saga'
import ThreeDView from './ui/ThreeDView'

export default function ThreeDWindow(): React.JSX.Element {
  useInjectReducer({ key: 'threeDWindow', reducer: reducer as Reducer })
  useInjectSaga({ key: 'threeDWindow', saga })

  return <ThreeDView />
}
