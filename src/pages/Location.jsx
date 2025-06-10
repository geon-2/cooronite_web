import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { FaLocationCrosshairs } from 'react-icons/fa6';
import { initializeLocationTracking } from '../utils/locationUtils';

const Location = () => {
    const mapRef = useRef(null);
    const refs = useRef({
        overlayRef: null,
        circleRef: null,
        watchIdRef: null,
        lastLocationRef: null
    });

    // 좌표를 주소로 변환하는 함수
    const getAddressFromCoords = (latitude, longitude) => {
        // Kakao Maps SDK가 완전히 로드된 후에 Geocoder 사용
        if (window.kakao && window.kakao.maps && window.kakao.maps.services) {
            const geocoder = new window.kakao.maps.services.Geocoder();

            geocoder.coord2Address(longitude, latitude, (result, status) => {
                if (status === window.kakao.maps.services.Status.OK) {
                    const address = result[0];
                    const locationData = {
                        latitude,
                        longitude,
                        roadAddress: address.road_address ? address.road_address.address_name : '',
                        jibunAddress: address.address ? address.address.address_name : '',
                        timestamp: new Date().toISOString()
                    };

                    // webview로 위치 및 주소 정보 전송
                    if (window.ReactNativeWebView) {
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
                        timestamp: new Date().toISOString()
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
            const locationData = {
                latitude,
                longitude,
                roadAddress: '',
                jibunAddress: '',
                error: 'Geocoder 서비스 로드 실패',
                timestamp: new Date().toISOString()
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

    useEffect(() => {
        // Kakao Maps SDK 로드 확인
        const checkKakaoMaps = () => {
            if (window.kakao && window.kakao.maps) {
                window.kakao.maps.load(() => {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            const { latitude, longitude, accuracy } = pos.coords;
                            const latlng = new window.kakao.maps.LatLng(latitude, longitude);
                            const container = document.getElementById('map');
                            const map = new window.kakao.maps.Map(container, { center: latlng, level: 3 });

                            mapRef.current = map;
                            initializeLocationTracking(map, refs, latitude, longitude, accuracy);

                            // 초기 위치의 주소 정보 가져오기 (약간의 지연 후)
                            setTimeout(() => {
                                getAddressFromCoords(latitude, longitude);
                            }, 1000);

                            // 지도 이동 시 중심점의 주소 정보 업데이트
                            window.kakao.maps.event.addListener(map, 'dragend', () => {
                                const center = map.getCenter();
                                setTimeout(() => {
                                    getAddressFromCoords(center.getLat(), center.getLng());
                                }, 500);
                            });
                        },
                        (err) => {
                            const errorData = {
                                error: true,
                                message: '위치 정보를 가져올 수 없습니다.',
                                code: err.code,
                                details: err.message
                            };

                            if (window.ReactNativeWebView) {
                                window.ReactNativeWebView.postMessage(JSON.stringify({
                                    type: 'location_error',
                                    data: errorData
                                }));
                            } else {
                                alert('위치 정보를 가져올 수 없습니다.');
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

        return () => {
            if (refs.current.watchIdRef) {
                navigator.geolocation.clearWatch(refs.current.watchIdRef);
            }
        };
    }, []);

    return (
        <Container>
            <MapElement id="map" />
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

export default Location;