import { useEffect, useRef } from 'react';
import styled from 'styled-components';

const Location = () => {
    const mapRef = useRef(null);
    const markerRef = useRef(null);

    // 주차구역 내에 있는지 확인하는 함수
    const checkIfInParkingZone = (latitude, longitude) => {
        // zones 데이터가 있는지 확인
        if (!window.currentZonesData?.zones) {
            return { isInZone: false, zoneName: null };
        }

        // 현재 위치가 어떤 주차구역에 포함되는지 확인
        for (const zone of window.currentZonesData.zones) {
            if (!zone.coordinates || zone.coordinates.length < 3) continue;

            // Point-in-polygon 알고리즘 사용
            if (isPointInPolygon(latitude, longitude, zone.coordinates)) {
                return {
                    isInZone: true,
                    zoneName: zone.name || '주차 구역',
                    zoneId: zone.id
                };
            }
        }

        return { isInZone: false, zoneName: null };
    };

    // Point-in-polygon 알고리즘 (Ray casting)
    const isPointInPolygon = (lat, lng, polygon) => {
        let inside = false;
        const j = polygon.length - 1;

        for (let i = 0; i < polygon.length; i++) {
            const xi = polygon[i][1]; // latitude
            const yi = polygon[i][0]; // longitude
            const xj = polygon[j][1];
            const yj = polygon[j][0];

            if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    };

    // 좌표를 주소로 변환하는 함수
    const getAddressFromCoords = (latitude, longitude) => {
        console.log('🚀 getAddressFromCoords called with:', { latitude, longitude });

        // Kakao Maps SDK가 완전히 로드된 후에 Geocoder 사용
        if (window.kakao && window.kakao.maps && window.kakao.maps.services) {
            const geocoder = new window.kakao.maps.services.Geocoder();

            geocoder.coord2Address(longitude, latitude, (result, status) => {
                // 주차구역 확인
                const parkingZoneInfo = checkIfInParkingZone(latitude, longitude);

                if (status === window.kakao.maps.services.Status.OK) {
                    const address = result[0];
                    const locationData = {
                        latitude,
                        longitude,
                        roadAddress: address.road_address ? address.road_address.address_name : '',
                        jibunAddress: address.address ? address.address.address_name : '',
                        timestamp: new Date().toISOString(),
                        parkingZone: parkingZoneInfo
                    };

                    // webview로 위치 및 주소 정보 전송
                    if (window.ReactNativeWebView) {
                        console.log('Sending location data:', locationData);
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'location_address',
                            data: locationData
                        }));
                    } else {
                        console.log('Location address data:', locationData);
                    }
                } else {
                    // 주소 변환 실패 시에도 좌표 정보는 전송
                    const locationData = {
                        latitude,
                        longitude,
                        roadAddress: '',
                        jibunAddress: '',
                        error: '주소 변환 실패',
                        timestamp: new Date().toISOString(),
                        parkingZone: parkingZoneInfo
                    };

                    if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'location_address',
                            data: locationData
                        }));
                    } else {
                        console.log('Location data (address failed):', locationData);
                    }
                }
            });
        } else {
            // Services가 로드되지 않은 경우 좌표만 전송
            const parkingZoneInfo = checkIfInParkingZone(latitude, longitude);
            const locationData = {
                latitude,
                longitude,
                roadAddress: '',
                jibunAddress: '',
                error: 'Geocoder 서비스 로드 실패',
                timestamp: new Date().toISOString(),
                parkingZone: parkingZoneInfo
            };

            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'location_address',
                    data: locationData
                }));
            } else {
                console.log('Location data (no geocoder):', locationData);
            }
        }
    };

    // 반납 요청 처리 함수
    const handleReturnRequest = () => {
        if (mapRef.current && markerRef.current) {
            const center = mapRef.current.getCenter();
            const latitude = center.getLat();
            const longitude = center.getLng();

            // 현재 위치의 주차구역 확인
            const parkingZoneInfo = checkIfInParkingZone(latitude, longitude);

            // 반납 관련 데이터 전송
            const returnData = {
                latitude,
                longitude,
                parkingZone: parkingZoneInfo,
                timestamp: new Date().toISOString()
            };

            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'return_request',
                    data: returnData
                }));
            } else {
                console.log('Return request data:', returnData);
            }
        }
    };

    // 마커 위치 업데이트 함수
    const updateMarkerPosition = () => {
        if (mapRef.current && markerRef.current) {
            const center = mapRef.current.getCenter();
            markerRef.current.setPosition(center);

            // 마커 위치의 주소 정보 가져오기
            setTimeout(() => {
                getAddressFromCoords(center.getLat(), center.getLng());
            }, 300);
        }
    };

    useEffect(() => {
        // React Native에서 온 메시지 처리
        const handleMessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                if (message.type === 'request_return') {
                    handleReturnRequest();
                }
            } catch (error) {
                console.error('Message parsing error:', error);
            }
        };

        // 메시지 리스너 등록 (웹뷰 환경)
        if (window.ReactNativeWebView) {
            document.addEventListener('message', handleMessage);
            window.addEventListener('message', handleMessage);
        }

        // Kakao Maps SDK 로드 확인
        const checkKakaoMaps = () => {
            if (window.kakao && window.kakao.maps) {
                window.kakao.maps.load(() => {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            const { latitude, longitude } = pos.coords;
                            const latlng = new window.kakao.maps.LatLng(latitude, longitude);
                            const container = document.getElementById('map');
                            const map = new window.kakao.maps.Map(container, {
                                center: latlng,
                                level: 3
                            });

                            mapRef.current = map;

                            // 지도 중심에 마커 생성
                            const marker = new window.kakao.maps.Marker({
                                position: latlng,
                                map: map
                            });

                            markerRef.current = marker;

                            // 초기 위치의 주소 정보 가져오기
                            console.log('⏰ Setting timeout for initial address fetch');
                            setTimeout(() => {
                                console.log('🎯 Timeout executed, calling getAddressFromCoords');
                                getAddressFromCoords(latitude, longitude);
                            }, 1000);

                            // 지도 이동 시 마커 위치 및 주소 정보 업데이트
                            window.kakao.maps.event.addListener(map, 'dragend', updateMarkerPosition);
                            window.kakao.maps.event.addListener(map, 'zoom_changed', updateMarkerPosition);
                        },
                        (err) => {
                            // 위치 정보를 가져올 수 없는 경우 서울 시청을 기본 위치로 설정
                            const defaultLatlng = new window.kakao.maps.LatLng(37.5666805, 126.9784147);
                            const container = document.getElementById('map');
                            const map = new window.kakao.maps.Map(container, {
                                center: defaultLatlng,
                                level: 3
                            });

                            mapRef.current = map;

                            // 지도 중심에 마커 생성
                            const marker = new window.kakao.maps.Marker({
                                position: defaultLatlng,
                                map: map
                            });

                            markerRef.current = marker;

                            // 기본 위치의 주소 정보 가져오기
                            setTimeout(() => {
                                getAddressFromCoords(37.5666805, 126.9784147);
                            }, 1000);

                            // 지도 이동 시 마커 위치 및 주소 정보 업데이트
                            window.kakao.maps.event.addListener(map, 'dragend', updateMarkerPosition);
                            window.kakao.maps.event.addListener(map, 'zoom_changed', updateMarkerPosition);

                            const errorData = {
                                error: true,
                                message: '위치 정보를 가져올 수 없어 기본 위치로 설정되었습니다.',
                                code: err.code,
                                details: err.message
                            };

                            if (window.ReactNativeWebView) {
                                window.ReactNativeWebView.postMessage(JSON.stringify({
                                    type: 'location_error',
                                    data: errorData
                                }));
                            } else {
                                console.warn('위치 정보를 가져올 수 없어 기본 위치로 설정되었습니다.');
                                console.error(err);
                            }
                        },
                        { enableHighAccuracy: true }
                    );
                });
            } else {
                // Kakao Maps가 아직 로드되지 않은 경우 재시도
                setTimeout(checkKakaoMaps, 500);
            }
        };

        checkKakaoMaps();

        // 클린업
        return () => {
            if (window.ReactNativeWebView) {
                document.removeEventListener('message', handleMessage);
                window.removeEventListener('message', handleMessage);
            }
        };
    }, []);

    return (
        <Container>
            <MapElement id="map" />
            <Crosshair>
                <HorizontalLine />
                <VerticalLine />
                <CenterDot />
            </Crosshair>
        </Container>
    );
};

const Container = styled.div`
    width: 100%;
    height: 100vh;
    position: relative;
`;

const MapElement = styled.div`
    width: 100%;
    height: 100%;
`;

const Crosshair = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 10;
    pointer-events: none;
`;

const HorizontalLine = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 20px;
    height: 2px;
    background-color: #333;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8);
`;

const VerticalLine = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 2px;
    height: 20px;
    background-color: #333;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8);
`;

const CenterDot = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 4px;
    height: 4px;
    background-color: #ff4757;
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8);
`;

export default Location;