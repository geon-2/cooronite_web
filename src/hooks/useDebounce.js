import { useCallback, useRef } from 'react';

/**
 * 디바운스 훅 - 연속된 함수 호출을 지연시켜 성능을 최적화합니다.
 * @param {Function} callback - 실행할 함수
 * @param {number} delay - 지연 시간 (밀리초)
 * @returns {Function} 디바운스된 함수
 */
export const useDebounce = (callback, delay) => {
    const timeoutRef = useRef(null);

    return useCallback(
        (...args) => {
            // 이전 타이머가 있다면 취소
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            // 새 타이머 설정
            timeoutRef.current = setTimeout(() => {
                callback(...args);
            }, delay);
        },
        [callback, delay]
    );
};